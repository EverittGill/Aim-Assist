/**
 * Auto-Text Rules Service
 * Manages automated text message rules for leads
 * Ensures safe, controlled AI engagement
 */

const { supabase } = require('../config/supabase');
const QueueManager = require('../queues/QueueManager').default;

class AutoTextRulesService {
  /**
   * Check if a lead matches any auto-text rules
   * Called when a lead is created or updated
   */
  static async checkAndApplyRules(tenantId, lead) {
    try {
      console.log(`🔍 Checking auto-text rules for lead ${lead.crm_lead_id}`);
      
      // Safety check: Don't text if do_not_contact is true
      if (lead.do_not_contact) {
        console.log('⛔ Lead has do_not_contact flag - skipping auto-text');
        return { applied: false, reason: 'do_not_contact' };
      }
      
      // Safety check: Must have valid phone
      if (!lead.phone) {
        console.log('⛔ Lead has no phone number - skipping auto-text');
        return { applied: false, reason: 'no_phone' };
      }
      
      // Get active rules for this tenant
      const rules = await this.getActiveRules(tenantId);
      
      if (!rules || rules.length === 0) {
        console.log('📋 No active auto-text rules for tenant');
        return { applied: false, reason: 'no_rules' };
      }
      
      // Check each rule in priority order
      for (const rule of rules) {
        const matches = await this.leadMatchesRule(lead, rule);
        
        if (matches) {
          console.log(`✅ Lead matches rule: ${rule.name}`);
          
          // Check if we've already sent to this lead
          const alreadySent = await this.hasAlreadySentToLead(lead.id, rule.id);
          if (alreadySent && rule.max_sends_per_lead <= 1) {
            console.log('⚠️ Already sent to this lead - skipping');
            continue;
          }
          
          // Check daily limits
          if (rule.max_sends_per_day) {
            const sentToday = await this.getSentCountToday(rule.id);
            if (sentToday >= rule.max_sends_per_day) {
              console.log('⚠️ Daily limit reached for this rule - skipping');
              continue;
            }
          }
          
          // Apply the rule
          await this.applyRule(tenantId, lead, rule);
          
          // Update rule statistics
          await this.updateRuleStats(rule.id, 'sent');
          
          // Enable AI for the lead if configured
          if (rule.trigger_conditions?.enable_ai) {
            await this.enableAIForLead(tenantId, lead.id);
          }
          
          return {
            applied: true,
            rule_id: rule.id,
            rule_name: rule.name
          };
        }
      }
      
      console.log('📋 No matching rules for lead');
      return { applied: false, reason: 'no_match' };
      
    } catch (error) {
      console.error('Error checking auto-text rules:', error);
      return { applied: false, reason: 'error', error: error.message };
    }
  }
  
  /**
   * Get active rules for a tenant
   */
  static async getActiveRules(tenantId) {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('auto_text_rules')
      .select('*')
      .eq('organization_id', tenantId)
      .eq('is_active', true)
      .order('priority', { ascending: true }); // Lower priority number = higher priority
    
    if (error) {
      console.error('Error fetching auto-text rules:', error);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Check if a lead matches a specific rule
   */
  static async leadMatchesRule(lead, rule) {
    // Check trigger type
    switch (rule.trigger_type) {
      case 'new_lead':
        // Check if lead is new (created in last hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (new Date(lead.created_at) < oneHourAgo) {
          return false;
        }
        break;
        
      case 'tag_added':
        // Will be triggered by webhook, not sync
        break;
        
      default:
        // Custom trigger logic
        break;
    }
    
    // Check source filter
    if (rule.lead_sources && rule.lead_sources.length > 0) {
      if (!rule.lead_sources.includes(lead.source)) {
        console.log(`Lead source ${lead.source} not in rule sources:`, rule.lead_sources);
        return false;
      }
    }
    
    // Check required tags
    if (rule.lead_tags && rule.lead_tags.length > 0) {
      const leadTags = lead.tags || [];
      const hasRequiredTag = rule.lead_tags.some(tag => leadTags.includes(tag));
      if (!hasRequiredTag) {
        console.log(`Lead tags ${leadTags} don't match required tags:`, rule.lead_tags);
        return false;
      }
    }
    
    // Check excluded tags (safety feature)
    if (rule.excluded_tags && rule.excluded_tags.length > 0) {
      const leadTags = lead.tags || [];
      const hasExcludedTag = rule.excluded_tags.some(tag => leadTags.includes(tag));
      if (hasExcludedTag) {
        console.log(`Lead has excluded tag - skipping`);
        return false;
      }
    }
    
    // Check AI status - don't auto-text if already active
    if (lead.ai_status === 'active' || lead.ai_status === 'qualified') {
      console.log(`Lead AI status is ${lead.ai_status} - skipping auto-text`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Apply a rule to a lead (queue the auto-text)
   */
  static async applyRule(tenantId, lead, rule) {
    // Calculate delay considering business hours
    const delay = this.calculateDelay(rule);
    
    // Personalize message
    let message = rule.message_template;
    message = message.replace('{firstName}', lead.first_name || 'there');
    message = message.replace('{lastName}', lead.last_name || '');
    message = message.replace('{source}', lead.source || '');
    
    // Queue the auto-text
    await QueueManager.queueAutoText({
      tenantId,
      leadId: lead.crm_lead_id,
      ruleId: rule.id,
      message,
      trigger: rule.trigger_type
    }, delay / 60); // Convert to minutes
    
    // Log the application
    if (supabase) {
      await supabase
        .from('auto_text_applications')
        .insert({
          organization_id: tenantId,
          lead_id: lead.id,
          rule_id: rule.id,
          scheduled_at: new Date(Date.now() + delay),
          status: 'scheduled'
        });
    }
    
    console.log(`📅 Auto-text scheduled for lead ${lead.crm_lead_id} with ${delay/1000}s delay`);
  }
  
  /**
   * Calculate delay considering business hours
   */
  static calculateDelay(rule) {
    const now = new Date();
    const delayMs = (rule.delay_minutes || 1) * 60 * 1000;
    const scheduledTime = new Date(now.getTime() + delayMs);
    
    // Parse business hours
    const [startHour, startMin] = rule.send_window_start.split(':').map(Number);
    const [endHour, endMin] = rule.send_window_end.split(':').map(Number);
    
    // Check if scheduled time is within business hours
    const scheduledHour = scheduledTime.getHours();
    const scheduledMinute = scheduledTime.getMinutes();
    
    // If before business hours, schedule for start of business hours
    if (scheduledHour < startHour || (scheduledHour === startHour && scheduledMinute < startMin)) {
      scheduledTime.setHours(startHour, startMin, 0, 0);
    }
    
    // If after business hours, schedule for next day's start
    if (scheduledHour > endHour || (scheduledHour === endHour && scheduledMinute > endMin)) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
      scheduledTime.setHours(startHour, startMin, 0, 0);
    }
    
    return Math.max(scheduledTime.getTime() - now.getTime(), delayMs);
  }
  
  /**
   * Check if we've already sent to this lead
   */
  static async hasAlreadySentToLead(leadId, ruleId) {
    if (!supabase) return false;
    
    const { data, error } = await supabase
      .from('auto_text_applications')
      .select('id')
      .eq('lead_id', leadId)
      .eq('rule_id', ruleId)
      .eq('status', 'sent')
      .limit(1);
    
    return data && data.length > 0;
  }
  
  /**
   * Get count of messages sent today for a rule
   */
  static async getSentCountToday(ruleId) {
    if (!supabase) return 0;
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const { count, error } = await supabase
      .from('auto_text_applications')
      .select('*', { count: 'exact', head: true })
      .eq('rule_id', ruleId)
      .eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString());
    
    return count || 0;
  }
  
  /**
   * Update rule statistics
   */
  static async updateRuleStats(ruleId, action) {
    if (!supabase) return;
    
    try {
      // Get current stats
      const { data: currentRule } = await supabase
        .from('auto_text_rules')
        .select('sends_count, responses_count')
        .eq('id', ruleId)
        .single();
      
      const updates = {};
      if (action === 'sent') {
        updates.sends_count = (currentRule?.sends_count || 0) + 1;
        updates.last_triggered_at = new Date();
      } else if (action === 'response') {
        updates.responses_count = (currentRule?.responses_count || 0) + 1;
      }
      
      await supabase
        .from('auto_text_rules')
        .update(updates)
        .eq('id', ruleId);
    } catch (error) {
      console.error('Error updating rule stats:', error);
    }
  }
  
  /**
   * Enable AI for a lead
   */
  static async enableAIForLead(tenantId, leadId) {
    if (!supabase) return;
    
    await supabase
      .from('leads')
      .update({
        ai_status: 'active',
        updated_at: new Date()
      })
      .eq('id', leadId)
      .eq('organization_id', tenantId);
    
    console.log(`🤖 AI enabled for lead ${leadId}`);
  }
  
  /**
   * Create a new auto-text rule
   */
  static async createRule(tenantId, ruleData) {
    if (!supabase) throw new Error('Database not configured');
    
    const rule = {
      organization_id: tenantId,
      name: ruleData.name,
      description: ruleData.description,
      is_active: false, // Always start inactive for safety
      priority: ruleData.priority || 10,
      trigger_type: ruleData.trigger_type || 'new_lead',
      trigger_conditions: ruleData.trigger_conditions || {},
      delay_minutes: ruleData.delay_minutes || 1,
      send_window_start: ruleData.send_window_start || '09:00:00',
      send_window_end: ruleData.send_window_end || '20:00:00',
      timezone: ruleData.timezone || 'America/New_York',
      lead_sources: ruleData.lead_sources || [],
      lead_tags: ruleData.lead_tags || [],
      excluded_tags: ruleData.excluded_tags || ['VIP', 'DO_NOT_TEXT', 'MANUAL_ONLY'],
      message_template: ruleData.message_template,
      max_sends_per_lead: ruleData.max_sends_per_lead || 1,
      max_sends_per_day: ruleData.max_sends_per_day,
      stop_on_response: ruleData.stop_on_response !== false
    };
    
    const { data, error } = await supabase
      .from('auto_text_rules')
      .insert(rule)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`✅ Created auto-text rule: ${data.name}`);
    return data;
  }
  
  /**
   * Get all rules for a tenant
   */
  static async getRules(tenantId) {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('auto_text_rules')
      .select('*')
      .eq('organization_id', tenantId)
      .order('priority', { ascending: true });
    
    if (error) {
      console.error('Error fetching rules:', error);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Update a rule
   */
  static async updateRule(ruleId, updates) {
    if (!supabase) throw new Error('Database not configured');
    
    const { data, error } = await supabase
      .from('auto_text_rules')
      .update({
        ...updates,
        updated_at: new Date()
      })
      .eq('id', ruleId)
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  }
  
  /**
   * Delete a rule
   */
  static async deleteRule(ruleId) {
    if (!supabase) throw new Error('Database not configured');
    
    const { error } = await supabase
      .from('auto_text_rules')
      .delete()
      .eq('id', ruleId);
    
    if (error) throw error;
    
    return { success: true };
  }
  
  /**
   * Test a rule on a specific lead (dry run)
   */
  static async testRule(ruleId, leadId) {
    if (!supabase) throw new Error('Database not configured');
    
    const { data: rule } = await supabase
      .from('auto_text_rules')
      .select('*')
      .eq('id', ruleId)
      .single();
    
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    
    if (!rule || !lead) {
      throw new Error('Rule or lead not found');
    }
    
    const matches = await this.leadMatchesRule(lead, rule);
    
    // Personalize message for preview
    let message = rule.message_template;
    message = message.replace('{firstName}', lead.first_name || 'there');
    message = message.replace('{lastName}', lead.last_name || '');
    
    return {
      matches,
      rule,
      lead: {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
        phone: lead.phone,
        tags: lead.tags,
        source: lead.source
      },
      preview_message: message,
      would_send: matches && !lead.do_not_contact && lead.phone
    };
  }
}

// Create the auto_text_applications tracking table if it doesn't exist
const createTrackingTable = `
CREATE TABLE IF NOT EXISTS public.auto_text_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES auto_text_rules(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'scheduled',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_applications_status (organization_id, status),
  CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled'))
);
`;

module.exports = AutoTextRulesService;