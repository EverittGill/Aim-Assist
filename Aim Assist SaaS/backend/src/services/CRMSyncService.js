/**
 * Comprehensive CRM Sync Service
 * Handles full and incremental sync from CRM to Supabase
 * Captures ALL available data including tags, custom fields, and history
 */

const { supabase } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');

class CRMSyncService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.batchSize = 100; // Process in batches for efficiency
    this.syncStats = {
      fetched: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Perform full sync of all leads from CRM
   */
  async fullSync() {
    console.log(`🔄 Starting full CRM sync for tenant ${this.tenantId}`);
    const syncId = await this.startSyncTracking('full');
    
    try {
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      let offset = 0;
      let hasMore = true;
      let totalExpected = 0;
      
      while (hasMore) {
        // Fetch batch of leads from CRM
        const result = await adapter.getLeads({
          limit: 100,  // Use smaller batches for better performance
          offset: offset
        });
        
        // Handle both old format (array) and new format (object with leads)
        const leads = Array.isArray(result) ? result : result.leads;
        hasMore = Array.isArray(result) ? leads.length === 100 : result.hasMore;
        totalExpected = Array.isArray(result) ? 0 : result.total;
        
        if (!leads || leads.length === 0) {
          hasMore = false;
          break;
        }
        
        console.log(`📦 Processing batch: ${leads.length} leads (offset: ${offset}${totalExpected ? ` of ${totalExpected} total` : ''})`);
        
        // Process batch
        await this.processBatch(leads);
        
        offset += leads.length;
        this.syncStats.fetched += leads.length;
        
        // Show progress
        if (totalExpected > 0) {
          const progress = Math.round((this.syncStats.fetched / totalExpected) * 100);
          console.log(`📊 Progress: ${this.syncStats.fetched}/${totalExpected} leads (${progress}%)`);
        }
      }
      
      await this.completeSyncTracking(syncId, 'completed');
      console.log(`✅ Full sync completed:`, this.syncStats);
      return this.syncStats;
      
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      await this.completeSyncTracking(syncId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Perform incremental sync of recently updated leads
   */
  async incrementalSync(sinceMinutesAgo = 15) {
    console.log(`🔄 Starting incremental sync for tenant ${this.tenantId} (last ${sinceMinutesAgo} minutes)`);
    const syncId = await this.startSyncTracking('incremental');
    
    try {
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      
      // Calculate timestamp for incremental sync
      const sinceDate = new Date(Date.now() - sinceMinutesAgo * 60 * 1000);
      
      // FUB doesn't have a direct "updated since" filter, so we fetch all and filter
      // In production, you'd want to implement webhook-based updates
      const result = await adapter.getLeads({ limit: 1000 });
      
      // Handle both old format (array) and new format (object with leads)
      const allLeads = Array.isArray(result) ? result : result.leads;
      
      // Filter leads updated since our timestamp
      const recentLeads = allLeads.filter(lead => {
        const updatedAt = lead.crm_data?.updated || lead.crm_data?.modified;
        if (!updatedAt) return false;
        return new Date(updatedAt) > sinceDate;
      });
      
      console.log(`📦 Found ${recentLeads.length} recently updated leads`);
      
      if (recentLeads.length > 0) {
        await this.processBatch(recentLeads);
      }
      
      this.syncStats.fetched = recentLeads.length;
      
      await this.completeSyncTracking(syncId, 'completed');
      console.log(`✅ Incremental sync completed:`, this.syncStats);
      return this.syncStats;
      
    } catch (error) {
      console.error('❌ Incremental sync failed:', error);
      await this.completeSyncTracking(syncId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Sync a single lead by CRM ID
   */
  async syncSingleLead(crmLeadId) {
    console.log(`🔄 Syncing single lead ${crmLeadId} for tenant ${this.tenantId}`);
    
    try {
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      const lead = await adapter.getLead(crmLeadId);
      
      if (!lead) {
        throw new Error(`Lead ${crmLeadId} not found in CRM`);
      }
      
      await this.processBatch([lead]);
      
      console.log(`✅ Lead ${crmLeadId} synced successfully`);
      return this.syncStats;
      
    } catch (error) {
      console.error(`❌ Failed to sync lead ${crmLeadId}:`, error);
      throw error;
    }
  }

  /**
   * Process a batch of leads (upsert to database)
   */
  async processBatch(leads) {
    for (const lead of leads) {
      try {
        const dbLead = await this.upsertLead(lead);
        
        // Check auto-text rules for new/updated leads
        if (dbLead && dbLead.ai_status === 'inactive') {
          const AutoTextRulesService = require('./AutoTextRulesService');
          await AutoTextRulesService.checkAndApplyRules(this.tenantId, dbLead);
        }
      } catch (error) {
        console.error(`Error processing lead ${lead.crm_lead_id}:`, error.message);
        this.syncStats.failed++;
        this.syncStats.errors.push({
          lead_id: lead.crm_lead_id,
          error: error.message
        });
      }
    }
  }

  /**
   * Upsert a single lead to the database
   */
  async upsertLead(crmLead) {
    // Map CRM data to our schema (using Eugenia's proven mapping)
    const leadData = this.mapCRMLeadToDatabase(crmLead);
    
    // Check if lead exists
    const { data: existing, error: checkError } = await supabase
      .from('leads')
      .select('id, updated_at')
      .eq('tenant_id', this.tenantId)
      .eq('crm_lead_id', leadData.crm_lead_id)
      .eq('crm_type', leadData.crm_type)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    if (existing) {
      // Update existing lead
      const { data: updated, error: updateError } = await supabase
        .from('leads')
        .update({
          ...leadData,
          updated_at: new Date()
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      this.syncStats.updated++;
      console.log(`📝 Updated lead: ${leadData.first_name} ${leadData.last_name} (${leadData.crm_lead_id})`);
      return updated;
    } else {
      // Create new lead
      const { data: created, error: insertError } = await supabase
        .from('leads')
        .insert({
          ...leadData,
          tenant_id: this.tenantId,
          created_at: new Date()
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      this.syncStats.created++;
      console.log(`✨ Created lead: ${leadData.first_name} ${leadData.last_name} (${leadData.crm_lead_id})`);
      return created;
    }
  }

  /**
   * Map CRM lead data to database schema
   * Uses Eugenia's proven field mapping for comprehensive data capture
   */
  mapCRMLeadToDatabase(crmLead) {
    // Handle both raw FUB data and pre-mapped data from adapter
    const fubData = crmLead.crm_data || crmLead;
    
    // Extract primary phone and email
    const primaryPhone = this.extractPrimaryPhone(fubData);
    const secondaryPhone = this.extractSecondaryPhone(fubData);
    const primaryEmail = this.extractPrimaryEmail(fubData);
    
    // Extract full name
    const fullName = fubData.name || 
                    `${fubData.firstName || ''} ${fubData.lastName || ''}`.trim() ||
                    `${crmLead.first_name || ''} ${crmLead.last_name || ''}`.trim();
    
    // Map tags (CRITICAL - as user specified)
    const tags = this.extractTags(fubData);
    
    // Extract custom fields
    const customFields = this.extractCustomFields(fubData);
    
    return {
      crm_lead_id: (fubData.id || crmLead.crm_lead_id || '').toString(),
      crm_type: 'followupboss',
      first_name: fubData.firstName || crmLead.first_name || '',
      last_name: fubData.lastName || crmLead.last_name || '',
      full_name: fullName,
      email: primaryEmail,
      phone: this.normalizePhone(primaryPhone),
      phone_secondary: this.normalizePhone(secondaryPhone),
      source: fubData.source || crmLead.source || 'Unknown',
      tags: tags,
      stage: fubData.stage || crmLead.stage || null,
      status: this.mapStageToStatus(fubData.stage),
      assigned_user_crm_id: (fubData.assignedUserId || '').toString(),
      background: fubData.background || '',
      notes: fubData.background || crmLead.notes || '',
      source_url: fubData.sourceUrl || null,
      addresses: fubData.addresses || [],
      last_communication: fubData.lastCommunication || {},
      crm_created_at: fubData.created ? new Date(fubData.created) : null,
      crm_updated_at: fubData.updated ? new Date(fubData.updated) : null,
      custom_fields: customFields,
      metadata: {
        sourceUrl: fubData.sourceUrl,
        ylopoStarsLink: this.extractYlopoLink(fubData),
        lastCommunication: fubData.lastCommunication,
        phones: fubData.phones || [],
        emails: fubData.emails || []
      },
      crm_data: fubData,
      last_synced_at: new Date(),
      sync_status: 'synced'
    };
  }

  /**
   * Extract tags from FUB data (CRITICAL)
   */
  extractTags(fubData) {
    if (!fubData.tags) return [];
    
    // Tags can be strings or objects with name property
    return fubData.tags.map(tag => {
      if (typeof tag === 'string') return tag;
      if (tag && tag.name) return tag.name;
      return null;
    }).filter(Boolean);
  }

  /**
   * Extract custom fields from FUB data
   */
  extractCustomFields(fubData) {
    if (!fubData.customFields || !Array.isArray(fubData.customFields)) {
      return {};
    }
    
    const fields = {};
    for (const field of fubData.customFields) {
      if (field.name && field.value !== undefined) {
        fields[field.name] = field.value;
        
        // Log for debugging (like Eugenia does)
        if (field.name.toLowerCase().includes('eugenia') || 
            field.name.toLowerCase().includes('aim')) {
          console.log(`📋 Custom field found: ${field.name} = ${field.value}`);
        }
      }
    }
    
    return fields;
  }

  /**
   * Extract primary phone from FUB data
   */
  extractPrimaryPhone(fubData) {
    if (!fubData.phones || !Array.isArray(fubData.phones)) return null;
    
    const primary = fubData.phones.find(p => p.isPrimary);
    if (primary) return primary.value;
    
    return fubData.phones[0]?.value || null;
  }

  /**
   * Extract secondary phone from FUB data
   */
  extractSecondaryPhone(fubData) {
    if (!fubData.phones || !Array.isArray(fubData.phones)) return null;
    
    // Find first non-primary phone
    const secondary = fubData.phones.find(p => !p.isPrimary);
    return secondary?.value || null;
  }

  /**
   * Extract primary email from FUB data
   */
  extractPrimaryEmail(fubData) {
    if (!fubData.emails || !Array.isArray(fubData.emails)) return null;
    
    const primary = fubData.emails.find(e => e.isPrimary);
    if (primary) return primary.value;
    
    return fubData.emails[0]?.value || null;
  }

  /**
   * Extract Ylopo Stars link if present
   */
  extractYlopoLink(fubData) {
    if (!fubData.sourceUrl) return null;
    
    if (fubData.sourceUrl.includes('stars.ylopo.com')) {
      return fubData.sourceUrl;
    }
    
    return null;
  }

  /**
   * Normalize phone number to E.164 format (using Eugenia's logic)
   */
  normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle US numbers
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    // Return original if can't normalize
    return phone;
  }

  /**
   * Map FUB stage to our status
   */
  mapStageToStatus(stage) {
    if (!stage) return 'active';
    
    const stageMap = {
      'Lead': 'active',
      'Contacted': 'active',
      'Qualified': 'qualified',
      'Showing': 'active',
      'Contract': 'active',
      'Closed': 'closed',
      'Lost': 'lost'
    };
    
    return stageMap[stage] || 'active';
  }

  /**
   * Start tracking a sync operation
   */
  async startSyncTracking(syncType) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('sync_history')
      .insert({
        tenant_id: this.tenantId,
        sync_type: syncType,
        sync_status: 'started',
        crm_type: 'followupboss'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating sync tracking:', error);
      return null;
    }
    
    return data.id;
  }

  /**
   * Complete sync tracking
   */
  async completeSyncTracking(syncId, status, errorMessage = null) {
    if (!supabase || !syncId) return;
    
    const completedAt = new Date();
    const { data: syncRecord } = await supabase
      .from('sync_history')
      .select('started_at')
      .eq('id', syncId)
      .single();
    
    const duration = syncRecord ? 
      Math.floor((completedAt - new Date(syncRecord.started_at)) / 1000) : 0;
    
    await supabase
      .from('sync_history')
      .update({
        sync_status: status,
        completed_at: completedAt,
        duration_seconds: duration,
        leads_fetched: this.syncStats.fetched,
        leads_created: this.syncStats.created,
        leads_updated: this.syncStats.updated,
        leads_failed: this.syncStats.failed,
        error_message: errorMessage,
        error_details: this.syncStats.errors.length > 0 ? this.syncStats.errors : null
      })
      .eq('id', syncId);
  }

  /**
   * Get sync history for tenant
   */
  static async getSyncHistory(tenantId, limit = 10) {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('sync_history')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching sync history:', error);
      return [];
    }
    
    return data;
  }

  /**
   * Get sync status
   */
  static async getSyncStatus(tenantId) {
    const history = await this.getSyncHistory(tenantId, 1);
    const lastSync = history[0];
    
    if (!lastSync) {
      return {
        status: 'never_synced',
        last_sync: null,
        message: 'No sync has been performed yet'
      };
    }
    
    if (lastSync.sync_status === 'started') {
      return {
        status: 'in_progress',
        last_sync: lastSync.started_at,
        message: `${lastSync.sync_type} sync in progress...`
      };
    }
    
    return {
      status: lastSync.sync_status,
      last_sync: lastSync.completed_at || lastSync.started_at,
      type: lastSync.sync_type,
      stats: {
        fetched: lastSync.leads_fetched,
        created: lastSync.leads_created,
        updated: lastSync.leads_updated,
        failed: lastSync.leads_failed
      },
      duration: lastSync.duration_seconds,
      message: lastSync.error_message || 'Sync completed successfully'
    };
  }
}

module.exports = CRMSyncService;