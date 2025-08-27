/**
 * Lead Nurturing Service
 * Handles automated nurturing campaigns and property viewing triggers
 */

const { supabase } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');
const ClaudeService = require('./ai/ClaudeService');
const queueManager = require('../queues/QueueManager').default;

class NurturingService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.claudeService = new ClaudeService(tenantId);
  }
  
  /**
   * Process property viewing webhook from CRM
   */
  async handlePropertyViewing(leadId, viewingData) {
    console.log(`🏠 Processing property viewing for lead ${leadId}`);
    
    try {
      // Get lead from database
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', this.tenantId)
        .eq('crm_lead_id', leadId)
        .single();
      
      if (!lead) {
        console.log(`Lead ${leadId} not found in database`);
        return;
      }
      
      // Check if AI is enabled for this lead
      if (lead.ai_status !== 'active') {
        console.log(`AI not active for lead ${leadId}`);
        return;
      }
      
      // Analyze viewing pattern
      const trigger = await this.analyzeViewingPattern(lead, viewingData);
      
      if (trigger) {
        console.log(`🎯 Trigger detected: ${trigger.type}`);
        await this.sendNurturingMessage(lead, trigger);
      }
      
    } catch (error) {
      console.error('Error handling property viewing:', error);
    }
  }
  
  /**
   * Analyze property viewing patterns for triggers
   */
  async analyzeViewingPattern(lead, viewingData) {
    const { 
      propertyId,
      propertyAddress,
      viewCount = 1,
      lastViewedAt,
      totalProperties,
      sessionDuration
    } = viewingData;
    
    // Get lead's viewing history
    const history = lead.metadata?.viewing_history || [];
    
    // Update viewing history
    history.push({
      propertyId,
      propertyAddress,
      viewedAt: new Date(),
      viewCount,
      sessionDuration
    });
    
    // Save updated history
    await supabase
      .from('leads')
      .update({
        metadata: {
          ...lead.metadata,
          viewing_history: history,
          last_activity: new Date()
        }
      })
      .eq('id', lead.id);
    
    // Check for triggers
    
    // 1. Returned after 7+ days of inactivity
    const lastActivity = lead.metadata?.last_activity;
    if (lastActivity) {
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceActivity >= 7) {
        return {
          type: 'return_after_inactive',
          days: daysSinceActivity,
          property: propertyAddress,
          message: `Welcome back! I see you're looking at ${propertyAddress}. This property has been popular! Would you like to schedule a showing?`
        };
      }
    }
    
    // 2. Viewed same property 3+ times
    if (viewCount >= 3) {
      return {
        type: 'multiple_views_same_property',
        viewCount,
        property: propertyAddress,
        message: `You've viewed ${propertyAddress} ${viewCount} times! It must have caught your eye. Want to see it in person?`
      };
    }
    
    // 3. Viewed 5+ properties in one session
    if (totalProperties >= 5) {
      return {
        type: 'high_engagement',
        totalProperties,
        message: `You've been busy looking at properties! I can help narrow down your favorites. What features are most important to you?`
      };
    }
    
    // 4. Spent 10+ minutes on a property
    if (sessionDuration >= 600) {
      return {
        type: 'long_viewing_session',
        duration: Math.round(sessionDuration / 60),
        property: propertyAddress,
        message: `You spent some quality time looking at ${propertyAddress}! Any questions about it? I can get you more details.`
      };
    }
    
    return null;
  }
  
  /**
   * Send nurturing message based on trigger
   */
  async sendNurturingMessage(lead, trigger) {
    try {
      // Generate personalized message with Claude
      const response = await this.claudeService.generateResponse({
        leadId: lead.crm_lead_id,
        leadName: lead.full_name,
        currentMessage: `[SYSTEM: Lead triggered ${trigger.type} - craft appropriate follow-up]`,
        conversationHistory: [],
        leadContext: {
          trigger: trigger.type,
          property: trigger.property,
          viewCount: trigger.viewCount,
          days_inactive: trigger.days
        },
        template: 'property_nurturing'
      });
      
      // Use trigger message if Claude doesn't generate one
      const message = response?.message || trigger.message;
      
      if (!lead.phone) {
        console.log(`No phone number for lead ${lead.crm_lead_id}`);
        return;
      }
      
      // Queue SMS
      await queueManager.queueSMS({
        tenantId: this.tenantId,
        leadId: lead.crm_lead_id,
        to: lead.phone,
        message,
        conversationId: null,
        delay: 5000, // Send after 5 seconds
        metadata: {
          campaign: 'property_viewing',
          trigger: trigger.type
        }
      });
      
      // Log to CRM
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      await adapter.logMessage(lead.crm_lead_id, {
        direction: 'outbound',
        content: message,
        from: process.env.TWILIO_FROM_NUMBER,
        to: lead.phone
      });
      
      // Track campaign metrics
      await this.trackCampaignMetric(trigger.type, 'sent');
      
      console.log(`✅ Nurturing message sent for trigger: ${trigger.type}`);
      
    } catch (error) {
      console.error('Error sending nurturing message:', error);
    }
  }
  
  /**
   * Run periodic nurturing campaigns
   */
  async runPeriodicNurturing() {
    console.log(`🔄 Running periodic nurturing for tenant ${this.tenantId}`);
    
    try {
      // Get leads eligible for nurturing
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', this.tenantId)
        .eq('ai_status', 'active')
        .eq('status', 'active')
        .not('phone', 'is', null);
      
      if (!leads || leads.length === 0) {
        console.log('No eligible leads for nurturing');
        return;
      }
      
      for (const lead of leads) {
        await this.checkAndSendPeriodicMessage(lead);
      }
      
      console.log(`✅ Processed ${leads.length} leads for periodic nurturing`);
      
    } catch (error) {
      console.error('Error in periodic nurturing:', error);
    }
  }
  
  /**
   * Check if lead should receive periodic message
   */
  async checkAndSendPeriodicMessage(lead) {
    try {
      const lastContact = lead.metadata?.last_contact_at;
      
      if (!lastContact) {
        // Never contacted, send initial outreach
        await this.sendInitialOutreach(lead);
        return;
      }
      
      const daysSinceContact = Math.floor(
        (Date.now() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Nurturing schedule
      let message = null;
      let campaignType = null;
      
      if (daysSinceContact === 3) {
        campaignType = '3_day_followup';
        message = `Hi ${lead.first_name}! Just checking in. Have you had a chance to think about what we discussed?`;
      } else if (daysSinceContact === 7) {
        campaignType = '7_day_followup';
        message = `Hey ${lead.first_name}, hope you're having a great week! Any new thoughts on your home search?`;
      } else if (daysSinceContact === 14) {
        campaignType = '14_day_followup';
        message = `Hi ${lead.first_name}! Market update: new properties matching your criteria just listed. Want to take a look?`;
      } else if (daysSinceContact === 30) {
        campaignType = '30_day_checkin';
        message = `${lead.first_name}, it's been a month! The market's been moving. Still interested in finding your perfect home?`;
      }
      
      if (message && campaignType) {
        // Queue the message
        await queueManager.queueSMS({
          tenantId: this.tenantId,
          leadId: lead.crm_lead_id,
          to: lead.phone,
          message,
          conversationId: null,
          delay: Math.random() * 3600000, // Random delay up to 1 hour
          metadata: {
            campaign: 'periodic_nurturing',
            type: campaignType
          }
        });
        
        // Update last contact
        await supabase
          .from('leads')
          .update({
            metadata: {
              ...lead.metadata,
              last_contact_at: new Date(),
              last_campaign: campaignType
            }
          })
          .eq('id', lead.id);
        
        console.log(`📅 Scheduled ${campaignType} for ${lead.full_name}`);
      }
      
    } catch (error) {
      console.error(`Error checking periodic message for lead ${lead.id}:`, error);
    }
  }
  
  /**
   * Send initial outreach to new lead
   */
  async sendInitialOutreach(lead) {
    try {
      const message = `Hi ${lead.first_name}! I'm the AI assistant at ${process.env.USER_AGENCY_NAME || 'our agency'}. I saw you were interested in real estate. What kind of property are you looking for?`;
      
      await queueManager.queueSMS({
        tenantId: this.tenantId,
        leadId: lead.crm_lead_id,
        to: lead.phone,
        message,
        conversationId: null,
        delay: 5000,
        metadata: {
          campaign: 'initial_outreach'
        }
      });
      
      // Update metadata
      await supabase
        .from('leads')
        .update({
          metadata: {
            ...lead.metadata,
            last_contact_at: new Date(),
            initial_outreach_sent: true
          }
        })
        .eq('id', lead.id);
      
      console.log(`👋 Initial outreach sent to ${lead.full_name}`);
      
    } catch (error) {
      console.error('Error sending initial outreach:', error);
    }
  }
  
  /**
   * Track campaign metrics
   */
  async trackCampaignMetric(campaignType, action) {
    try {
      await supabase
        .from('campaign_metrics')
        .insert({
          organization_id: this.tenantId,
          campaign_type: campaignType,
          action,
          timestamp: new Date()
        });
    } catch (error) {
      console.error('Error tracking metric:', error);
    }
  }
}

module.exports = NurturingService;