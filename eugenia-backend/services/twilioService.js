const twilio = require('twilio');

class TwilioService {
  constructor(accountSid, authToken, fromNumber) {
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio account SID, auth token, and from number are required');
    }
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendSMS(toNumber, message) {
    try {
      console.log(`Sending SMS to ${toNumber}: ${message}`);
      
      const messageResult = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      console.log(`SMS sent successfully. SID: ${messageResult.sid}`);
      return {
        success: true,
        messageSid: messageResult.sid,
        status: messageResult.status,
        to: messageResult.to,
        from: messageResult.from
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  validateWebhookSignature(signature, url, params) {
    try {
      return twilio.validateRequest(
        this.authToken,
        signature,
        url,
        params
      );
    } catch (error) {
      console.error('Error validating webhook signature:', error);
      return false;
    }
  }

  parseIncomingSMS(body) {
    return {
      messageSid: body.MessageSid,
      accountSid: body.AccountSid,
      from: body.From,
      to: body.To,
      body: body.Body,
      numMedia: parseInt(body.NumMedia || '0'),
      timestamp: new Date().toISOString()
    };
  }

  // Queue an SMS instead of sending directly
  async queueSMS(toNumber, message, options = {}) {
    try {
      const { queues } = require('../config/queues');
      
      if (!queues?.smsQueue) {
        console.warn('Queue not available, sending SMS directly');
        return this.sendSMS(toNumber, message);
      }
      
      const jobData = {
        to: toNumber,
        message,
        leadId: options.leadId,
        direction: options.direction || 'outbound',
        fromNumber: options.fromNumber || this.fromNumber,
        priority: options.priority || 0
      };
      
      const job = await queues.smsQueue.add('send-sms', jobData, {
        priority: options.priority || 0,
        delay: options.delay || 0
      });
      
      console.log(`SMS queued successfully. Job ID: ${job.id}`);
      return {
        success: true,
        queued: true,
        jobId: job.id,
        to: toNumber
      };
    } catch (error) {
      console.error('Error queuing SMS:', error);
      // Fallback to direct sending if queue fails
      console.warn('Falling back to direct SMS sending');
      return this.sendSMS(toNumber, message);
    }
  }
}

module.exports = TwilioService;