const express = require('express');
const router = express.Router();

module.exports = (twilioService, fubService, geminiService, conversationService) => {
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
      
      // 2. Log incoming message to FUB
      try {
        await fubService.logTextMessage(
          lead.id,
          incomingMessage.body,
          'inbound',
          incomingMessage.from,
          incomingMessage.to
        );
        console.log('Incoming message logged to FUB');
      } catch (error) {
        console.error('Failed to log incoming message to FUB:', error);
        // Continue processing even if logging fails
      }
      
      // 3. Check if AI is paused for this lead
      const isPaused = lead.customFields?.find(
        cf => cf.name === process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME
      )?.value === 'inactive';
      
      if (isPaused) {
        console.log('AI is paused for this lead, not generating response');
        // TODO: Send notification to agent that paused lead messaged
        return res.status(200).send('<Response></Response>');
      }
      
      // 4. Fetch conversation history
      const conversationHistory = await conversationService.getConversationHistory(lead.id);
      console.log(`Fetched ${conversationHistory.length} messages from conversation history`);
      
      // 5. Generate AI response
      const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
      const aiResponse = await geminiService.generateReply(
        lead,
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
      
      // 6. Apply 45-second delay for natural response timing
      console.log('Waiting 45 seconds before sending response...');
      await new Promise(resolve => setTimeout(resolve, 45000));
      
      // 7. Send AI response via Twilio
      try {
        const sentMessage = await twilioService.sendSMS(
          incomingMessage.from,
          aiResponse.message
        );
        console.log('AI response sent successfully:', sentMessage.sid);
        
        // 8. Log outbound message to FUB
        await fubService.logTextMessage(
          lead.id,
          aiResponse.message,
          'outbound',
          incomingMessage.to,  // Eugenia's number
          incomingMessage.from // Lead's number
        );
        console.log('Outbound message logged to FUB');
      } catch (error) {
        console.error('Failed to send AI response:', error);
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