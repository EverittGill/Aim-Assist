/**
 * Processes SMS jobs from queue
 * Implements 45-second delay for natural timing
 * Handles retries on failure
 * Updates conversation after sending
 */

const TwilioService = require('../../services/messaging/TwilioService');
const LeadService = require('../../services/LeadService');
const ConversationService = require('../../services/ConversationService');
const TenantService = require('../../services/TenantService');
const CRMFactory = require('../../services/crm/CRMFactory');

module.exports = async function processSMS(job) {
  const {
    organizationId,
    tenantId, // Keep for backward compatibility
    leadId,
    to,
    message,
    conversationId,
    messageId
  } = job.data;
  
  // Use organizationId, fall back to tenantId for compatibility
  const orgId = organizationId || tenantId;
  
  console.log(`\n📱 Processing SMS job ${job.id}:`, {
    organizationId: orgId,
    leadId,
    to,
    messagePreview: message ? message.substring(0, 50) : 'No message',
    hasConversationId: !!conversationId
  });
  
  try {
    // Create Twilio service for organization
    const twilioService = new TwilioService(orgId);
    
    // Send the SMS
    const result = await twilioService.sendSMS(to, message);
    
    // Log outbound message to FUB for native conversation tracking
    if (leadId && orgId) {
      try {
        const adapter = await CRMFactory.getAdapter(orgId);
        // Get the actual phone number used by Twilio service
        const TenantPhoneService = require('../../services/TenantPhoneService');
        const fromPhone = await TenantPhoneService.getTenantPrimaryPhone(orgId) || 
                         process.env.TWILIO_FROM_NUMBER || '+18662981158';
        
        console.log(`📞 Using from phone: ${fromPhone} for organization ${orgId}`);
        
        const logged = await adapter.logMessage(leadId, {
          direction: 'outbound',
          content: message,
          from: fromPhone,
          to: to
        });
        
        if (logged) {
          console.log('✅ Outbound SMS logged to FUB');
        } else {
          console.log('⚠️ Failed to log outbound SMS to FUB');
        }
      } catch (fubError) {
        console.error('Error logging to FUB:', fubError.message);
        // Continue - FUB logging failure shouldn't stop SMS delivery
      }
    }
    
    // Log message to Supabase conversation
    if (leadId && orgId) {
      try {
        const conversationService = new ConversationService(orgId);
        const supabaseLeadId = job.data.metadata?.supabaseLeadId;
        
        // Get or create conversation using the Supabase lead ID if available
        const leadIdToUse = supabaseLeadId || leadId;
        const conversation = await conversationService.getOrCreateConversation(leadIdToUse);
        
        if (conversation) {
          // Add outbound message to conversation
          await conversationService.addMessage(conversation.id, {
            lead_id: conversation.lead_id,
            direction: 'outbound',
            message_type: 'text',
            sender_type: 'ai',
            content: message,
            channel_type: 'sms',
            provider_sid: result.sid,
            metadata: {
              twilio_status: result.status,
              ...job.data.metadata
            }
          });
          console.log('✅ Message logged to Supabase conversation');
        }
      } catch (dbError) {
        console.error('Error logging to Supabase:', dbError.message);
      }
    }
    
    // Update message status in database (if messageId was provided)
    if (messageId && ConversationService) {
      await ConversationService.updateMessageStatus(messageId, {
        twilio_sid: result.sid,
        twilio_status: result.status,
        delivered_at: new Date()
      });
    }
    
    // Record conversation if lead ID provided (optional)
    if (leadId) {
      try {
        await LeadService.recordConversation(leadId);
      } catch (error) {
        console.warn('⚠️ Failed to record conversation:', error.message);
        // Continue - this is not critical
      }
    }
    
    // Record usage for billing (optional)
    try {
      await TenantService.recordUsage(orgId, 'sms_sent', 1, {
        lead_id: leadId,
        message_id: messageId
      });
    } catch (error) {
      console.warn('⚠️ Failed to record usage:', error.message);
      // Continue - this is not critical for SMS delivery
    }
    
    console.log(`✅ SMS sent successfully: ${result.sid}`);
    
    return {
      success: true,
      twilioSid: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error(`❌ SMS job ${job.id} failed:`, error);
    
    // Update message as failed
    if (messageId && ConversationService) {
      await ConversationService.updateMessageStatus(messageId, {
        failed_at: new Date(),
        failure_reason: error.message
      });
    }
    
    // Check if we should retry
    if (job.attemptsMade < job.opts.attempts) {
      throw error; // Bull will retry
    }
    
    // Final failure - notify tenant
    console.error(`SMS permanently failed after ${job.attemptsMade} attempts`);
    
    return {
      success: false,
      error: error.message
    };
  }
};