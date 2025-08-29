/**
 * Notification Service
 * Handles agent notifications for qualified leads and important events
 */

const TwilioService = require('./messaging/TwilioService');
const { supabase } = require('../config/supabase');

class NotificationService {
  constructor(organizationId) {
    this.organizationId = organizationId;
    this.twilioService = new TwilioService(organizationId);
  }

  /**
   * Notify agent of qualified lead
   */
  async notifyAgentOfQualifiedLead(leadId, extraction, leadInfo) {
    try {
      // Validate inputs
      if (!leadId) {
        console.warn('Cannot notify - no lead ID provided');
        return false;
      }
      
      if (!leadInfo) {
        leadInfo = { id: leadId, name: 'Unknown Lead' };
      }
      
      // Build notification message
      const message = this.buildQualifiedLeadMessage(leadInfo, extraction);
      
      // Get agent notification phone
      const agentPhone = await this.getAgentNotificationPhone();
      
      if (!agentPhone) {
        console.log('⚠️ No agent notification phone configured');
        return false;
      }
      
      // Send SMS notification
      const sent = await this.twilioService.sendSMS({
        to: agentPhone,
        body: message
      });
      
      if (sent) {
        console.log(`📱 Qualified lead notification sent to ${agentPhone}`);
      }
      
      // Log notification to audit_logs
      await this.logNotification(leadId, 'qualified_lead', extraction);
      
      return sent;
    } catch (error) {
      console.error('Error notifying agent of qualified lead:', error);
      return false;
    }
  }

  /**
   * Notify agent of engaged lead (high message count)
   */
  async notifyAgentOfEngagedLead(leadId, messageCount, leadInfo) {
    try {
      const message = `🔥 Engaged Lead!\n` +
        `Name: ${leadInfo.name || 'Unknown'}\n` +
        `Phone: ${leadInfo.phone || 'N/A'}\n` +
        `Messages: ${messageCount}\n` +
        `View: ${this.getLeadUrl(leadId)}`;
      
      const agentPhone = await this.getAgentNotificationPhone();
      
      if (!agentPhone) {
        console.log('⚠️ No agent notification phone configured');
        return false;
      }
      
      const sent = await this.twilioService.sendSMS({
        to: agentPhone,
        body: message
      });
      
      if (sent) {
        console.log(`📱 Engaged lead notification sent to ${agentPhone}`);
      }
      
      await this.logNotification(leadId, 'engaged_lead', { messageCount });
      
      return sent;
    } catch (error) {
      console.error('Error notifying agent of engaged lead:', error);
      return false;
    }
  }

  /**
   * Notify agent of escalation
   */
  async notifyAgentOfEscalation(leadId, reason, leadInfo) {
    try {
      const message = `⚠️ Lead Escalation!\n` +
        `Name: ${leadInfo.name || 'Unknown'}\n` +
        `Reason: ${reason}\n` +
        `View: ${this.getLeadUrl(leadId)}`;
      
      const agentPhone = await this.getAgentNotificationPhone();
      
      if (!agentPhone) {
        return false;
      }
      
      const sent = await this.twilioService.sendSMS({
        to: agentPhone,
        body: message
      });
      
      await this.logNotification(leadId, 'escalation', { reason });
      
      return sent;
    } catch (error) {
      console.error('Error notifying agent of escalation:', error);
      return false;
    }
  }

  /**
   * Build qualified lead notification message
   */
  buildQualifiedLeadMessage(leadInfo, extraction) {
    const name = leadInfo.name || `${leadInfo.first_name || ''} ${leadInfo.last_name || ''}`.trim() || 'Lead';
    const phone = leadInfo.phone || 'N/A';
    
    // Extract key qualification data
    const budget = extraction.budget?.value ? 
      `$${(extraction.budget.value / 1000).toFixed(0)}k` : 'Unknown';
    const timeline = extraction.timeline?.value || 'Unknown';
    const financing = extraction.financing?.status || 'Unknown';
    const confidence = Math.round((extraction.overallConfidence || 0) * 100);
    
    const message = `🎯 Qualified Lead!\n` +
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Budget: ${budget}\n` +
      `Timeline: ${timeline}\n` +
      `Financing: ${financing}\n` +
      `Confidence: ${confidence}%\n` +
      `View: ${this.getLeadUrl(leadInfo.id || leadInfo.crm_lead_id)}`;
    
    return message;
  }

  /**
   * Get agent notification phone number
   */
  async getAgentNotificationPhone() {
    try {
      // First check environment variable
      if (process.env.AGENT_NOTIFICATION_PHONE) {
        return process.env.AGENT_NOTIFICATION_PHONE;
      }
      
      // Get from organization settings
      if (supabase) {
        const { data: org } = await supabase
          .from('organizations')
          .select('settings')
          .eq('id', this.organizationId)
          .single();
        
        if (org?.settings?.notification_phone) {
          return org.settings.notification_phone;
        }
      }
      
      // Fallback to USER_NOTIFICATION_PHONE env var
      return process.env.USER_NOTIFICATION_PHONE || null;
    } catch (error) {
      console.error('Error getting agent notification phone:', error);
      return null;
    }
  }

  /**
   * Get lead URL for viewing
   */
  getLeadUrl(leadId) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${frontendUrl}/conversation/${leadId}`;
  }

  /**
   * Log notification to audit_logs
   */
  async logNotification(leadId, notificationType, details) {
    try {
      if (!supabase) {
        console.log('📝 Mock notification log:', {
          leadId,
          type: notificationType,
          details
        });
        return;
      }
      
      const { error } = await supabase
        .from('audit_logs')
        .insert([{
          organization_id: this.organizationId,
          action: 'agent_notification',
          resource_type: 'lead',
          resource_id: leadId,
          details: {
            notification_type: notificationType,
            ...details
          },
          created_at: new Date()
        }]);
      
      if (error) {
        console.warn('Failed to log notification:', error.message);
      }
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * Send batch notifications for multiple qualified leads
   */
  async notifyBatchQualified(leads) {
    try {
      if (!leads || leads.length === 0) {
        return;
      }
      
      const summary = `🎯 ${leads.length} Qualified Leads!\n\n` +
        leads.map(l => `• ${l.name || 'Unknown'} - ${l.phone || 'N/A'}`).join('\n') +
        `\n\nView all in your CRM dashboard`;
      
      const agentPhone = await this.getAgentNotificationPhone();
      
      if (!agentPhone) {
        return false;
      }
      
      return await this.twilioService.sendSMS({
        to: agentPhone,
        body: summary
      });
    } catch (error) {
      console.error('Error sending batch notification:', error);
      return false;
    }
  }
}

module.exports = NotificationService;