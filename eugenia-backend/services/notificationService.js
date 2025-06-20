/**
 * Notification Service
 * Handles sending notifications to users about lead engagement
 */

class NotificationService {
  constructor(twilioService, fubService) {
    this.twilioService = twilioService;
    this.fubService = fubService;
    this.userPhoneNumber = process.env.USER_NOTIFICATION_PHONE || null;
  }

  /**
   * Send notification when 3-message limit is reached
   */
  async notifyMessageLimitReached(leadDetails) {
    if (!this.twilioService || !this.userPhoneNumber) {
      console.log('Notification skipped - Twilio or user phone not configured');
      return;
    }

    // Check if lead has dev mode enabled
    const devModeService = require('./devModeService');
    if (devModeService.isDevModeEnabled(leadDetails.id)) {
      console.log(`🛠️ [DEV MODE] Notification skipped for lead ${leadDetails.id}`);
      return;
    }

    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      console.log(`📱 [DEV MODE] Would send notification: Lead ${leadDetails.name} hit 3-message limit`);
      return;
    }

    try {
      const message = `🚨 Eugenia Alert: ${leadDetails.name || 'A lead'} has been actively engaging! They've sent 3 messages. Check FUB or call them directly. Lead ID: ${leadDetails.id}`;
      
      await this.twilioService.sendSMS(this.userPhoneNumber, message);
      console.log(`✅ Notification sent to ${this.userPhoneNumber}`);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Schedule a 2-hour pause for the lead
   */
  async schedulePause(leadId, hours = 2) {
    // Check if lead has dev mode enabled
    const devModeService = require('./devModeService');
    if (devModeService.isDevModeEnabled(leadId)) {
      console.log(`🛠️ [DEV MODE] Pause scheduling skipped for lead ${leadId}`);
      return null;
    }
    
    const pauseUntil = new Date();
    pauseUntil.setHours(pauseUntil.getHours() + hours);
    
    // Store pause timestamp in custom field or notes
    // This would be checked before allowing Eugenia to respond
    try {
      if (this.fubService) {
        // Note: This field might need to be created in FUB first
        const fieldName = 'customEugeniaPausedUntil';
        
        try {
          await this.fubService.updateLeadCustomField(
            leadId,
            fieldName,
            pauseUntil.toISOString()
          );
          console.log(`⏸️ Lead ${leadId} paused until ${pauseUntil.toLocaleString()}`);
        } catch (fieldError) {
          console.warn(`⚠️ Could not update ${fieldName} field. It may need to be created in FUB first.`);
          console.error('Field update error:', fieldError.message);
        }
      }
    } catch (error) {
      console.error('Failed to schedule pause:', error);
    }
    
    return pauseUntil;
  }

  /**
   * Check if a lead is currently paused
   */
  async isLeadPaused(leadId) {
    if (!this.fubService) return false;
    
    try {
      const lead = await this.fubService.getLeadById(leadId);
      const pausedUntilField = lead.customFields?.find(
        f => f.name === 'customEugeniaPausedUntil'
      );
      
      if (pausedUntilField?.value) {
        const pausedUntil = new Date(pausedUntilField.value);
        const now = new Date();
        
        if (pausedUntil > now) {
          console.log(`⏸️ Lead ${leadId} is paused until ${pausedUntil.toLocaleString()}`);
          return true;
        }
      }
    } catch (error) {
      console.error('Error checking pause status:', error);
    }
    
    return false;
  }
}

module.exports = NotificationService;