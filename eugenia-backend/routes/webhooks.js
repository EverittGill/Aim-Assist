const express = require('express');
const router = express.Router();

module.exports = (twilioService, fubService, geminiService, conversationService) => {
  // Initialize notification service
  const NotificationService = require('../services/notificationService');
  const notificationService = new NotificationService(twilioService, fubService);
  router.post('/twilio-sms', express.raw({ type: 'application/x-www-form-urlencoded' }), async (req, res) => {
    if (!twilioService) {
      return res.status(503).send('SMS service not configured');
    }

    try {
      const body = new URLSearchParams(req.body.toString());
      const bodyObj = Object.fromEntries(body);
      
      // Verify webhook signature for security
      const signature = req.headers['x-twilio-signature'];
      const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      // Skip signature validation in development mode
      if (process.env.NODE_ENV !== 'development') {
        if (!twilioService.validateWebhookSignature(signature, webhookUrl, bodyObj)) {
          console.error('Invalid Twilio webhook signature');
          return res.status(403).send('Forbidden');
        }
      } else {
        console.log('⚠️  Webhook signature validation skipped (development mode)');
      }
      
      const incomingMessage = twilioService.parseIncomingSMS(bodyObj);
      console.log('\n=== Incoming SMS Received ===' + 
                  '\nFrom:', incomingMessage.from,
                  '\nTo:', incomingMessage.to,
                  '\nMessage:', incomingMessage.body);
      
      // 1. Look up lead by phone number
      const lead = await fubService.findLeadByPhone(incomingMessage.from);
      
      if (!lead) {
        console.error('No lead found for phone number:', incomingMessage.from);
        // TODO: Send notification to agent about unknown number
        // For now, just acknowledge receipt
        return res.status(200).send('<Response></Response>');
      }
      
      console.log(`Lead found: ${lead.name} (ID: ${lead.id})`);
      
      // 2. Log incoming message to FUB notes storage
      try {
        await fubService.addMessageToLeadStorage(lead.id, {
          direction: 'inbound',
          type: 'sms',
          content: incomingMessage.body,
          twilioSid: incomingMessage.sid,
          timestamp: new Date().toISOString()
        });
        console.log('Incoming message stored in FUB notes');
      } catch (error) {
        console.error('Failed to store message in FUB notes:', error);
        // Continue processing even if storage fails
      }
      
      // 2b. Also try to log to FUB text messages (if they give access)
      try {
        await fubService.logTextMessage(
          lead.id,
          incomingMessage.body,
          'inbound',
          incomingMessage.from,
          incomingMessage.to
        );
        console.log('Incoming message logged to FUB text messages');
      } catch (error) {
        console.error('Failed to log to FUB text messages:', error);
        // This is expected if FUB doesn't give text message access
      }
      
      // 3. Check if AI is paused for this lead
      const statusField = lead.customFields?.find(
        cf => cf.name === process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME
      )?.value;
      const isPermanentlyPaused = statusField === 'inactive';
      
      // Check temporary pause
      const isTemporarilyPaused = await notificationService.isLeadPaused(lead.id);
      
      if (isPermanentlyPaused || isTemporarilyPaused) {
        console.log(`AI is ${isPermanentlyPaused ? 'permanently' : 'temporarily'} paused for lead ${lead.name}`);
        return res.status(200).send('<Response></Response>');
      }
      
      // 4. Fetch conversation history
      const conversationHistory = await conversationService.getConversationHistory(lead.id);
      console.log(`Fetched ${conversationHistory.length} messages from conversation history`);
      
      // 5. Generate AI response with full lead context
      const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
      
      // Extract full lead context
      const fullLeadContext = {
        id: lead.id,
        name: lead.name,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.emails?.[0]?.value,
        phone: lead.phones?.[0]?.value,
        source: lead.source,
        stage: lead.stage,
        tags: lead.tags,
        notes: lead.background,
        customFields: lead.customFields,
        created: lead.created
      };
      
      const aiResponse = await geminiService.generateReply(
        fullLeadContext,
        conversationHistory,
        incomingMessage.body,
        agencyName
      );
      
      if (!aiResponse || !aiResponse.message) {
        console.error('No AI response generated');
        return res.status(200).send('<Response></Response>');
      }
      
      console.log('AI Response:', aiResponse.message);
      console.log('Should Pause:', aiResponse.shouldPause);
      
      // Handle qualification completion
      if (aiResponse.isQualificationComplete && aiResponse.qualificationStatus && notificationService) {
        console.log('🎯 Lead qualification complete via webhook');
        
        // Update qualification status in FUB
        const qualificationService = require('../services/qualificationService');
        await qualificationService.updateQualificationStatus(lead.id, aiResponse.qualificationStatus);
        
        // Send notification to agent
        await qualificationService.notifyAgentForQualification(fullLeadContext, aiResponse.qualificationStatus);
        
        // If there's a follow-up message, queue it first
        if (aiResponse.followUpMessage) {
          console.log('📤 Queueing Eugenia follow-up message:', aiResponse.followUpMessage);
          await twilioService.queueSMS(
            incomingMessage.from,
            aiResponse.followUpMessage,
            {
              leadId: lead.id,
              direction: 'outbound',
              fromNumber: incomingMessage.to,
              delay: 2000, // Send follow-up quickly after main response
              priority: 0  // High priority
            }
          );
        }
      }
      
      // 6. Queue AI response with natural delay
      try {
        const queueResult = await twilioService.queueSMS(
          incomingMessage.from,
          aiResponse.message,
          {
            leadId: lead.id,
            direction: 'outbound',
            fromNumber: incomingMessage.to,  // Eugenia's number
            delay: 45000, // 45-second delay for natural timing
            priority: 1   // Higher priority for responses
          }
        );
        
        if (queueResult.queued) {
          console.log(`AI response queued successfully (Job ID: ${queueResult.jobId})`);
          console.log('Message will be sent in 45 seconds for natural timing');
        } else {
          console.log('AI response sent directly (queue unavailable)');
        }
      } catch (error) {
        console.error('Failed to queue AI response:', error);
        // TODO: Send notification to agent about failed response
      }
      
      // 9. Update lead status if AI detected pause trigger
      if (aiResponse.shouldPause) {
        try {
          await fubService.updateLeadCustomField(
            lead.id,
            process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME,
            'inactive'
          );
          console.log('AI paused for lead due to escalation trigger');
          // TODO: Send notification to agent about escalation
        } catch (error) {
          console.error('Failed to update lead status:', error);
        }
      }
      
      // Always respond with 200 OK to Twilio
      res.status(200).send('<Response></Response>');
    } catch (error) {
      console.error('Error processing Twilio webhook:', error);
      // Still return 200 to prevent Twilio retries
      res.status(200).send('<Response></Response>');
    }
  });

  return router;
};