const express = require('express');
const router = express.Router();

module.exports = (twilioService) => {
  router.post('/twilio-sms', express.raw({ type: 'application/x-www-form-urlencoded' }), (req, res) => {
    if (!twilioService) {
      return res.status(503).send('SMS service not configured');
    }

    try {
      const body = new URLSearchParams(req.body.toString());
      const bodyObj = Object.fromEntries(body);
      
      const incomingMessage = twilioService.parseIncomingSMS(bodyObj);
      console.log('Incoming SMS:', incomingMessage);
      
      // TODO: Process the incoming message
      // 1. Look up lead by phone number
      // 2. Log to conversation history
      // 3. Generate AI response
      // 4. Send response if not paused
      
      res.status(200).send('<Response></Response>');
    } catch (error) {
      console.error('Error processing Twilio webhook:', error);
      res.status(500).send('Webhook processing failed');
    }
  });

  return router;
};