/**
 * Tag-Based Lead Polling Service
 * Efficiently polls CRM for leads with specific tags
 * Optimized for frequent checking without overloading API
 */

const { supabase } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');
const AutoTextRulesService = require('./AutoTextRulesService');
const QueueManager = require('../queues/QueueManager').default;

class TagPollingService {
  constructor(organizationId) {
    // Support both parameter names during transition
    this.organizationId = organizationId;
    this.tenantId = organizationId; // Keep for backward compatibility
    this.pollStats = {
      fetched: 0,
      new: 0,
      updated: 0,
      processed: 0,
      skipped: 0,
      errors: []
    };
  }

  /**
   * Poll for leads with specific tag(s)
   * More efficient than full sync for targeted monitoring
   */
  async pollForTag(tagName, options = {}) {
    const {
      processImmediately = true,
      enableAI = true,
      sendAutoText = true,
      sinceMinutesAgo = 60 // Default: check leads from last hour
    } = options;

    console.log(`🏷️  Polling for leads with tag: ${tagName} (organization: ${this.organizationId})`);
    
    try {
      // Get CRM adapter
      const adapter = await CRMFactory.getAdapter(this.organizationId);
      
      // Get last poll timestamp for this tag
      const lastPollTime = await this.getLastPollTime(tagName);
      const sinceTime = lastPollTime || new Date(Date.now() - sinceMinutesAgo * 60 * 1000);
      
      console.log(`⏰ Checking for leads since: ${sinceTime.toISOString()}`);
      
      // Fetch all leads (FUB doesn't have direct tag filter in API)
      // In production, consider using webhooks for better efficiency
      const result = await adapter.getLeads({ limit: 500 });
      const allLeads = Array.isArray(result) ? result : result.leads || [];
      
      // Filter for leads with the specific tag
      const taggedLeads = allLeads.filter(lead => {
        const tags = lead.tags || [];
        return tags.some(tag => {
          const tagValue = typeof tag === 'string' ? tag : tag.name;
          return tagValue && tagValue.toUpperCase() === tagName.toUpperCase();
        });
      });
      
      console.log(`📊 Found ${taggedLeads.length} leads with tag ${tagName}`);
      this.pollStats.fetched = taggedLeads.length;
      
      // Process each tagged lead
      const processedLeads = [];
      for (const lead of taggedLeads) {
        try {
          const processed = await this.processTaggedLead(lead, tagName, {
            processImmediately,
            enableAI,
            sendAutoText
          });
          
          if (processed) {
            processedLeads.push(processed);
            this.pollStats.processed++;
          } else {
            this.pollStats.skipped++;
          }
        } catch (error) {
          console.error(`Error processing lead ${lead.crm_lead_id}:`, error.message);
          this.pollStats.errors.push({
            lead_id: lead.crm_lead_id,
            error: error.message
          });
        }
      }
      
      // Update last poll timestamp
      await this.updateLastPollTime(tagName);
      
      console.log(`✅ Tag polling completed:`, this.pollStats);
      
      return {
        success: true,
        stats: this.pollStats,
        leads: processedLeads
      };
      
    } catch (error) {
      console.error(`❌ Tag polling failed:`, error);
      throw error;
    }
  }

  /**
   * Process a single tagged lead
   */
  async processTaggedLead(crmLead, tagName, options) {
    const { processImmediately, enableAI, sendAutoText } = options;
    
    // For now, use the organization directly (tenant_id IS organization_id)
    // This works because we're using organization_id as the tenant identifier
    const organizationId = this.tenantId;
    
    // Try to get tenant/org info - but don't fail if not found
    const { data: tenant } = await supabase
      .from('organizations')
      .select('id, crm_type, settings')
      .eq('id', this.tenantId)
      .single();
    
    // Use defaults if no tenant found (for testing)
    const tenantData = tenant || { 
      id: this.tenantId,
      crm_type: 'fub',
      settings: {}
    };
    const crmType = tenantData.crm_type || 'fub';
    const crmIdField = `${crmType}_lead_id`;
    
    // Check if lead already exists in Supabase
    // Note: using organization_id since that's the actual column name
    const { data: existingLead, error: checkError } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId)
      .eq(crmIdField, crmLead.crm_lead_id || crmLead.id)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    let dbLead;
    
    if (existingLead) {
      // Check if already sent auto-text for this tag
      const tagTracking = existingLead.custom_data?.tag_tracking || {};
      if (tagTracking[tagName]?.text_sent) {
        const textSentAt = new Date(tagTracking[tagName].text_sent_at || tagTracking[tagName].processed_at);
        const hoursSinceText = (Date.now() - textSentAt) / (1000 * 60 * 60);
        
        // Skip if text sent within last 24 hours
        if (hoursSinceText < 24) {
          console.log(`⏭️  Skipping lead ${crmLead.crm_lead_id} - already processed for ${tagName}`);
          return null;
        }
      }
      
      // Update existing lead with latest data
      dbLead = await this.updateLead(existingLead.id, crmLead, tagName);
      this.pollStats.updated++;
      console.log(`📝 Updated existing lead: ${dbLead.first_name} ${dbLead.last_name}`);
      
    } else {
      // Create new lead
      dbLead = await this.createLead(organizationId, crmLead, tagName, crmType);
      this.pollStats.new++;
      console.log(`✨ Created new lead: ${dbLead.first_name} ${dbLead.last_name}`);
    }
    
    // Process based on options
    if (processImmediately && dbLead) {
      console.log(`🔄 Processing lead ${dbLead.id} (${dbLead.first_name} ${dbLead.last_name}) for auto-text`);
      console.log(`  - sendAutoText: ${sendAutoText}`);
      console.log(`  - tag tracking:`, dbLead.custom_data?.tag_tracking?.[tagName]);
      
      // Enable AI if requested
      if (enableAI && dbLead.ai_enabled !== true) {
        await this.enableAIForLead(dbLead.id);
        console.log(`🤖 AI enabled for lead ${dbLead.id}`);
      }
      
      // Send auto-text if requested and not already sent
      const tagTracking = dbLead.custom_data?.tag_tracking?.[tagName] || {};
      console.log(`  - text_sent status: ${tagTracking.text_sent}`);
      
      if (sendAutoText && !tagTracking.text_sent) {
        console.log(`📱 Attempting to queue auto-text for lead ${dbLead.id}`);
        try {
          await this.queueAutoText(dbLead, tagName);
          console.log(`📱 Auto-text queued for lead ${dbLead.id}`);
          
          // Mark text as sent after successful queueing
          await this.markTextSent(dbLead.id, tagName);
        } catch (error) {
          console.error(`❌ Failed to queue auto-text for lead ${dbLead.id}:`, error.message);
          // Don't mark as sent if queueing failed - will retry on next poll
        }
      }
      
      // Check and apply auto-text rules
      // Lead now has phone in dedicated column
      await AutoTextRulesService.checkAndApplyRules(this.tenantId, dbLead);
    }
    
    return dbLead;
  }

  /**
   * Create a new lead in Supabase
   */
  async createLead(organizationId, crmLead, tagName, crmType) {
    // Extract phone numbers
    const phones = crmLead.phones || [];
    const primaryPhone = phones.find(p => p.isPrimary)?.value || phones[0]?.value;
    const secondaryPhone = phones.length > 1 ? phones.find(p => !p.isPrimary)?.value : null;
    
    // Extract email
    const email = crmLead.emails?.find(e => e.isPrimary)?.value || 
                  crmLead.emails?.[0]?.value || null;
    
    const leadData = {
      organization_id: organizationId,
      first_name: crmLead.first_name || crmLead.firstName || null,
      last_name: crmLead.last_name || crmLead.lastName || null,
      email: email,
      phone: this.normalizePhone(primaryPhone), // Now using dedicated column
      phone_secondary: this.normalizePhone(secondaryPhone), // Now using dedicated column
      source: crmLead.source || tagName,
      tags: crmLead.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
      stage: crmLead.stage || 'new',
      ai_enabled: true, // Enable AI for tagged leads
      message_count: 0,
      custom_data: {
        all_phones: phones.map(p => ({ // Keep all phones for reference
          value: this.normalizePhone(p.value),
          type: p.type,
          isPrimary: p.isPrimary
        })).filter(p => p.value),
        original_crm_data: {
          id: crmLead.id || crmLead.crm_lead_id,
          created: crmLead.created || crmLead.crm_data?.created,
          updated: crmLead.updated || crmLead.crm_data?.updated
        },
        tag_tracking: {
          [tagName]: {
            detected_at: new Date().toISOString(),
            detected: true,
            text_sent: false,
            processed: false  // Only mark as processed after auto-text is sent
          }
        },
        synced_at: new Date().toISOString()
      }
    };
    
    // Add CRM-specific ID
    const crmIdField = `${crmType}_lead_id`;
    leadData[crmIdField] = (crmLead.id || crmLead.crm_lead_id || '').toString();
    
    const { data, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  /**
   * Update an existing lead
   */
  async updateLead(leadId, crmLead, tagName) {
    // Get current lead to preserve custom_data
    const { data: currentLead } = await supabase
      .from('leads')
      .select('custom_data')
      .eq('id', leadId)
      .single();
    
    const existingCustomData = currentLead?.custom_data || {};
    const tagTracking = existingCustomData.tag_tracking || {};
    
    // Update tag tracking - preserve existing text_sent status
    tagTracking[tagName] = {
      ...tagTracking[tagName],  // Preserve existing fields
      detected_at: tagTracking[tagName]?.detected_at || new Date().toISOString(),
      detected: true,
      last_seen_at: new Date().toISOString(),
      process_count: (tagTracking[tagName]?.process_count || 0) + 1
      // Don't overwrite text_sent or processed status
    };
    
    const updates = {
      tags: crmLead.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
      custom_data: {
        ...existingCustomData,
        tag_tracking: tagTracking,
        last_tag_poll: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  /**
   * Queue auto-text for a lead
   */
  async queueAutoText(lead, tagName) {
    // Create personalized message
    const firstName = lead.first_name || 'there';
    const message = `Hi ${firstName}! I noticed you're interested in learning more about our properties. I'm here to help you find exactly what you're looking for. What specific features are most important to you in your next home?`;
    
    // Queue with 30-60 second delay for natural feel
    const delaySeconds = 30 + Math.floor(Math.random() * 30);
    
    // Use queueSMS method like other services do, with proper field name translation
    await QueueManager.queueSMS({
      tenantId: lead.organization_id,  // Translate organization_id to tenantId
      leadId: lead.id,
      to: lead.phone,                   // Translate phone to to
      message: message,
      conversationId: null,
      delay: delaySeconds * 1000,       // queueSMS expects delay in milliseconds
      metadata: {
        trigger: `tag_${tagName}`,
        tag: tagName,
        auto_text: true
      }
    });
    
    // Mark as sent in lead data
    await supabase
      .from('leads')
      .update({
        custom_data: {
          ...lead.custom_data,
          initial_text_sent: true,
          initial_text_sent_at: new Date().toISOString()
        }
      })
      .eq('id', lead.id);
  }

  /**
   * Enable AI for a lead
   */
  async enableAIForLead(leadId) {
    const { error } = await supabase
      .from('leads')
      .update({
        ai_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
  }

  /**
   * Mark that auto-text was sent for a tag
   */
  async markTextSent(leadId, tagName) {
    // Get current lead data
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('custom_data')
      .eq('id', leadId)
      .single();
    
    if (fetchError) throw fetchError;
    
    const customData = lead.custom_data || {};
    const tagTracking = customData.tag_tracking || {};
    
    // Update tag tracking with text sent status
    tagTracking[tagName] = {
      ...tagTracking[tagName],
      text_sent: true,
      text_sent_at: new Date().toISOString(),
      processed: true,
      processed_at: new Date().toISOString()
    };
    
    // Save updated custom data
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        custom_data: {
          ...customData,
          tag_tracking: tagTracking,
          initial_text_sent: true,
          initial_text_sent_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (updateError) throw updateError;
    
    console.log(`✅ Marked text as sent for lead ${leadId} tag ${tagName}`);
  }

  /**
   * Get last poll time for a tag
   */
  async getLastPollTime(tagName) {
    if (!supabase) return null;
    
    const { data } = await supabase
      .from('tag_poll_history')
      .select('last_poll_at')
      .eq('organization_id', this.tenantId)
      .eq('tag_name', tagName)
      .single();
    
    return data ? new Date(data.last_poll_at) : null;
  }

  /**
   * Update last poll time for a tag
   */
  async updateLastPollTime(tagName) {
    if (!supabase) return;
    
    const now = new Date();
    
    try {
      // Get current poll count
      const { data: currentHistory } = await supabase
        .from('tag_poll_history')
        .select('poll_count')
        .eq('organization_id', this.tenantId)
        .eq('tag_name', tagName)
        .single();
      
      const newPollCount = (currentHistory?.poll_count || 0) + 1;
      
      // Upsert poll history
      await supabase
        .from('tag_poll_history')
        .upsert({
          organization_id: this.tenantId,
          tag_name: tagName,
          last_poll_at: now,
          poll_count: newPollCount,
          leads_found: this.pollStats.fetched,
          leads_processed: this.pollStats.processed
        }, {
          onConflict: 'tenant_id,tag_name'
        });
    } catch (error) {
      console.error('Error updating poll history:', error);
    }
  }

  /**
   * Normalize phone number
   */
  normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    return phone;
  }

  /**
   * Get polling statistics for a tag
   */
  static async getTagPollStats(tenantId, tagName) {
    if (!supabase) return null;
    
    const { data } = await supabase
      .from('tag_poll_history')
      .select('*')
      .eq('organization_id', tenantId)
      .eq('tag_name', tagName)
      .single();
    
    return data;
  }

  /**
   * Get all monitored tags for a tenant
   */
  static async getMonitoredTags(tenantId) {
    if (!supabase) return [];
    
    const { data } = await supabase
      .from('tag_poll_history')
      .select('*')
      .eq('organization_id', tenantId)
      .order('last_poll_at', { ascending: false });
    
    return data || [];
  }
}

module.exports = TagPollingService;