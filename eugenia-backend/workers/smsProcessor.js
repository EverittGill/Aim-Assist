const { Sentry } = require('../config/sentry');

// Process SMS jobs from the queue
function createSmsProcessor(twilioService, fubService) {
  return async (job) => {
    const { to, message, leadId, direction = 'outbound', fromNumber, retryCount = 0 } = job.data;
    
    try {
      console.log(`Processing SMS job ${job.id}:`, { to, leadId, retryCount });
      
      // Send SMS via Twilio
      const result = await twilioService.sendSMS(to, message);
      
      // Log to FUB if lead ID provided
      if (leadId && fubService) {
        // Store in FUB notes
        try {
          await fubService.addMessageToLeadStorage(leadId, {
            direction: direction,
            type: 'ai',
            content: message,
            twilioSid: result.sid,
            timestamp: new Date().toISOString()
          });
          console.log(`SMS stored in FUB notes for lead ${leadId}`);
        } catch (storageError) {
          console.error('Failed to store in FUB notes:', storageError.message);
          Sentry.captureException(storageError, {
            extra: { leadId, jobId: job.id }
          });
        }
        
        // Also try to log to FUB text messages (if they give access)
        try {
          await fubService.logTextMessage(
            leadId,
            message,
            direction,
            fromNumber || process.env.TWILIO_FROM_NUMBER,
            to
          );
          console.log(`SMS logged to FUB text messages for lead ${leadId}`);
        } catch (fubError) {
          // Don't fail the job if FUB logging fails
          console.error('Failed to log to FUB text messages:', fubError.message);
          // This is expected if FUB doesn't give text message access
        }
      }
      
      return {
        success: true,
        messageSid: result.messageSid,
        to,
        leadId,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`SMS job ${job.id} failed:`, error.message);
      
      // Capture error in Sentry
      Sentry.captureException(error, {
        extra: {
          jobId: job.id,
          to,
          leadId,
          attempt: job.attemptsMade,
          maxAttempts: job.opts.attempts
        }
      });
      
      // If it's a permanent failure, don't retry
      if (error.code === 21211 || // Invalid phone number
          error.code === 21610 || // Unsubscribed recipient
          error.code === 21614) { // 'To' number not valid mobile
        console.error('Permanent failure - not retrying');
        throw new Error(`Permanent failure: ${error.message}`);
      }
      
      // Otherwise, let Bull retry
      throw error;
    }
  };
}

// Process lead outreach jobs
function createLeadProcessor(geminiService, twilioService, fubService) {
  return async (job) => {
    const { lead, agencyName, appDomain } = job.data;
    
    try {
      console.log(`Processing lead outreach for ${lead.name} (${lead.id})`);
      
      // Generate AI message
      const aiMessage = await geminiService.generateInitialOutreach(lead, agencyName);
      
      // Queue SMS (don't send directly)
      const { queues } = require('../config/queues');
      await queues.smsQueue.add('send-sms', {
        to: lead.phone,
        message: aiMessage,
        leadId: lead.id,
        direction: 'outbound'
      });
      
      // Update FUB custom fields
      const conversationUrl = `${appDomain}/conversation/${lead.id}`;
      
      await Promise.all([
        fubService.updateLeadCustomField(
          lead.id,
          process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME,
          'active'
        ),
        fubService.updateLeadCustomField(
          lead.id,
          process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME,
          conversationUrl
        )
      ]);
      
      return {
        success: true,
        leadId: lead.id,
        leadName: lead.name,
        message: aiMessage,
        conversationUrl
      };
      
    } catch (error) {
      console.error(`Lead processing failed for ${lead.id}:`, error);
      Sentry.captureException(error, {
        extra: { leadId: lead.id, leadName: lead.name }
      });
      throw error;
    }
  };
}

module.exports = { createSmsProcessor, createLeadProcessor };