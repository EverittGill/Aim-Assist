/**
 * Monitors for new leads from configured sources
 * Checks business hours and timezone settings
 * Queues automatic text messages with delays
 * Tracks which leads have been auto-texted
 */

const LeadService = require('../LeadService');
const AIService = require('../ai/AIService');
const TenantService = require('../TenantService');
const queueManager = require('../../queues/QueueManager');
const CRMFactory = require('../crm/CRMFactory');

class AutoTextService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.settings = null;
    this.aiService = new AIService(tenantId);
  }

  /**
   * Initialize with tenant settings
   */
  async initialize() {
    const tenant = await TenantService.getById(this.tenantId);
    this.settings = tenant?.settings || {};
    return this;
  }

  /**
   * Check if auto-text is enabled for a source
   */
  isEnabledForSource(source) {
    if (!this.settings.auto_text_enabled) return false;
    
    const enabledSources = this.settings.auto_text_sources || [];
    return enabledSources.includes(source.toLowerCase());
  }

  /**
   * Check if current time is within business hours
   */
  isWithinBusinessHours() {
    if (!this.settings.business_hours_enabled) return true;
    
    const now = new Date();
    const timezone = this.settings.timezone || 'America/New_York';
    
    // Convert to tenant's timezone
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hours = localTime.getHours();
    const minutes = localTime.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    
    // Parse business hours
    const { start, end } = this.settings.business_hours || { start: '09:00', end: '17:00' };
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Calculate delay until business hours start
   */
  getDelayUntilBusinessHours() {
    if (!this.settings.business_hours_enabled) return 0;
    
    const now = new Date();
    const timezone = this.settings.timezone || 'America/New_York';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    const { start } = this.settings.business_hours || { start: '09:00' };
    const [startHour, startMin] = start.split(':').map(Number);
    
    // Create date for next business hours start
    const nextStart = new Date(localTime);
    nextStart.setHours(startHour, startMin, 0, 0);
    
    // If we're past today's start, move to tomorrow
    if (localTime >= nextStart) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
    
    // Calculate delay in milliseconds
    return nextStart.getTime() - localTime.getTime();
  }

  /**
   * Process new lead for auto-text
   */
  async processNewLead(lead) {
    try {
      console.log(`🤖 Processing lead ${lead.id} for auto-text`);
      
      // Check if auto-text is enabled for this source
      if (!this.isEnabledForSource(lead.source)) {
        console.log(`Auto-text not enabled for source: ${lead.source}`);
        return { processed: false, reason: 'source_not_enabled' };
      }
      
      // Check if lead has valid phone
      if (!lead.phone) {
        console.log(`Lead ${lead.id} has no phone number`);
        return { processed: false, reason: 'no_phone' };
      }
      
      // Check if already auto-texted
      if (lead.ai_status !== 'inactive') {
        console.log(`Lead ${lead.id} already engaged (status: ${lead.ai_status})`);
        return { processed: false, reason: 'already_engaged' };
      }
      
      // Calculate delay
      let delayMs = (this.settings.auto_text_delay_minutes || 1) * 60 * 1000;
      
      // Add business hours delay if needed
      if (!this.isWithinBusinessHours()) {
        const businessHoursDelay = this.getDelayUntilBusinessHours();
        delayMs = Math.max(delayMs, businessHoursDelay);
        console.log(`Delaying auto-text until business hours (${businessHoursDelay / 1000 / 60} minutes)`);
      }
      
      // Queue auto-text job
      await queueManager.addJob('auto-text', {
        tenantId: this.tenantId,
        leadId: lead.id,
        templateId: `auto_text_${lead.source.toLowerCase()}`,
        delay: delayMs
      }, {
        delay: delayMs,
        priority: 2
      });
      
      // Mark lead as queued
      await LeadService.updateAIStatus(lead.id, 'queued');
      
      console.log(`✅ Auto-text queued for lead ${lead.id} with ${delayMs / 1000}s delay`);
      
      return {
        processed: true,
        leadId: lead.id,
        delay: delayMs
      };
    } catch (error) {
      console.error('Error processing lead for auto-text:', error);
      return {
        processed: false,
        reason: 'error',
        error: error.message
      };
    }
  }

  /**
   * Scan for new leads and queue auto-texts
   */
  async scanForNewLeads() {
    try {
      if (!this.settings) {
        await this.initialize();
      }
      
      if (!this.settings.auto_text_enabled) {
        console.log('Auto-text disabled for tenant');
        return { processed: 0 };
      }
      
      const results = [];
      
      // Process each enabled source
      for (const source of this.settings.auto_text_sources || []) {
        // Get eligible leads from last 24 hours
        const leads = await LeadService.getEligibleForAutoText(
          this.tenantId,
          source,
          24
        );
        
        console.log(`Found ${leads.length} eligible leads from ${source}`);
        
        // Process each lead
        for (const lead of leads) {
          const result = await this.processNewLead(lead);
          results.push(result);
          
          // Add small delay between processing to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const processed = results.filter(r => r.processed).length;
      console.log(`✅ Processed ${processed} leads for auto-text`);
      
      return {
        processed,
        total: results.length,
        results
      };
    } catch (error) {
      console.error('Error scanning for new leads:', error);
      throw error;
    }
  }

  /**
   * Create auto-text rule
   */
  static async createRule(tenantId, rule) {
    try {
      if (!supabase) {
        console.log('Mock rule created:', rule);
        return { id: 'rule-' + Date.now(), ...rule };
      }
      
      const { data, error } = await supabase
        .from('auto_text_rules')
        .insert([{
          organization_id: tenantId,
          ...rule
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating auto-text rule:', error);
      throw error;
    }
  }

  /**
   * Get auto-text rules for tenant
   */
  static async getRules(tenantId) {
    try {
      if (!supabase) {
        return [
          {
            id: 'rule-1',
            name: 'Website Leads',
            conditions: { source: ['website'] },
            delay_minutes: 1,
            is_active: true
          }
        ];
      }
      
      const { data, error } = await supabase
        .from('auto_text_rules')
        .select('*')
        .eq('organization_id', tenantId)
        .eq('is_active', true)
        .order('priority', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting auto-text rules:', error);
      return [];
    }
  }

  /**
   * Process webhook for new lead
   */
  static async processWebhookLead(tenantId, leadData) {
    try {
      const service = new AutoTextService(tenantId);
      await service.initialize();
      
      // Create or update lead in database
      const lead = await LeadService.create({
        organization_id: tenantId,
        ...leadData
      });
      
      // Process for auto-text
      return await service.processNewLead(lead);
    } catch (error) {
      console.error('Error processing webhook lead:', error);
      throw error;
    }
  }

  /**
   * Get auto-text statistics
   */
  static async getStats(tenantId, dateRange = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      
      // Mock stats for now
      return {
        total_sent: 150,
        conversion_rate: 0.35,
        average_response_time: '15 minutes',
        top_sources: [
          { source: 'website', count: 80 },
          { source: 'zillow', count: 45 },
          { source: 'realtor.com', count: 25 }
        ],
        hourly_distribution: [
          { hour: 9, count: 20 },
          { hour: 10, count: 25 },
          { hour: 11, count: 18 },
          { hour: 14, count: 22 },
          { hour: 15, count: 30 },
          { hour: 16, count: 35 }
        ]
      };
    } catch (error) {
      console.error('Error getting auto-text stats:', error);
      throw error;
    }
  }
}

module.exports = AutoTextService;