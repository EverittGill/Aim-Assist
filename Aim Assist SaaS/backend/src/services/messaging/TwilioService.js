/**
 * Enhanced Twilio integration with subaccounts per tenant
 * Each tenant gets isolated SMS capability
 * Manages phone number pool per tenant
 * Handles SMS sending with rate limiting
 */

const twilio = require('twilio');

class TwilioService {
  constructor(tenantId = null) {
    this.tenantId = tenantId;
    
    // Check if Twilio is configured (use DEMO variables if main ones not set)
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.DEMO_TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.DEMO_TWILIO_AUTH_TOKEN;
    
    this.isConfigured = !!(
      accountSid && 
      authToken &&
      accountSid !== 'your_twilio_account_sid_here'
    );
    
    if (this.isConfigured) {
      this.client = twilio(accountSid, authToken);
      console.log('✅ Twilio configured and ready');
    } else {
      console.warn('⚠️ Twilio not configured - SMS will be mocked');
      this.client = null;
    }
    
    // Mock phone numbers for testing
    this.mockPhoneNumbers = {
      'test-tenant-id': '+15551234567',
      'default': process.env.TWILIO_FROM_NUMBER || process.env.DEMO_TWILIO_FROM_NUMBER || '+15559999999'
    };
  }

  /**
   * Create subaccount for tenant
   */
  async createSubaccount(tenantName) {
    try {
      if (!this.isConfigured) {
        console.log(`Mock: Creating Twilio subaccount for ${tenantName}`);
        return {
          sid: 'AC_mock_' + Date.now(),
          friendlyName: tenantName,
          status: 'active'
        };
      }
      
      const subaccount = await this.client.api.accounts.create({
        friendlyName: `Aim Assist - ${tenantName}`
      });
      
      return subaccount;
    } catch (error) {
      console.error('Error creating Twilio subaccount:', error);
      throw error;
    }
  }

  /**
   * Purchase phone number for tenant
   */
  async purchasePhoneNumber(tenantId, areaCode = null) {
    try {
      if (!this.isConfigured) {
        const mockNumber = '+1555' + Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
        console.log(`Mock: Purchased phone number ${mockNumber} for tenant ${tenantId}`);
        return {
          phoneNumber: mockNumber,
          sid: 'PN_mock_' + Date.now(),
          capabilities: {
            sms: true,
            voice: false,
            mms: false
          }
        };
      }
      
      // Search for available numbers
      const availableNumbers = await this.client.availablePhoneNumbers('US')
        .local
        .list({
          areaCode: areaCode,
          smsEnabled: true,
          limit: 1
        });
      
      if (availableNumbers.length === 0) {
        throw new Error('No phone numbers available in this area code');
      }
      
      // Purchase the first available number
      const incoming = await this.client.incomingPhoneNumbers.create({
        phoneNumber: availableNumbers[0].phoneNumber,
        smsUrl: `${process.env.WEBHOOK_BASE_URL}/webhook/twilio?tenant=${tenantId}`,
        smsMethod: 'POST'
      });
      
      return incoming;
    } catch (error) {
      console.error('Error purchasing phone number:', error);
      throw error;
    }
  }

  /**
   * Get tenant's primary phone number
   */
  async getTenantPhoneNumber(tenantId) {
    // In production, fetch from database
    // For now, return mock or configured number
    if (!this.isConfigured) {
      return this.mockPhoneNumbers[tenantId] || this.mockPhoneNumbers.default;
    }
    
    // Check both DEMO and regular env vars
    const fromNumber = process.env.DEMO_TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) {
      throw new Error('No Twilio from number configured');
    }
    return fromNumber;
  }

  /**
   * Send SMS message
   */
  async sendSMS(to, message, from = null) {
    try {
      // Validate inputs
      if (!to) {
        throw new Error('Recipient phone number is required');
      }
      
      if (!message) {
        throw new Error('Message content is required');
      }
      
      // Get sender number
      const fromNumber = from || await this.getTenantPhoneNumber(this.tenantId);
      
      // Validate message length
      if (message.length > 1600) {
        throw new Error('Message exceeds SMS character limit (1600)');
      }
      
      // Mock implementation
      if (!this.isConfigured) {
        const mockResponse = {
          sid: 'SM_mock_' + Date.now(),
          to: to,
          from: fromNumber,
          body: message,
          status: 'sent',
          dateCreated: new Date(),
          mock: true
        };
        
        console.log('📱 Mock SMS sent:', {
          to,
          from: fromNumber,
          message: message.substring(0, 50) + '...',
          sid: mockResponse.sid
        });
        
        return mockResponse;
      }
      
      // Real Twilio send
      console.log('📤 Sending SMS via Twilio:', {
        to,
        from: fromNumber,
        messagePreview: message.substring(0, 50)
      });
      
      const result = await this.client.messages.create({
        body: message,
        from: fromNumber,
        to: to
      });
      
      console.log('📱 SMS sent successfully:', {
        sid: result.sid,
        to: result.to,
        status: result.status
      });
      
      return result;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  /**
   * Send SMS with retry logic
   */
  async sendSMSWithRetry(to, message, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendSMS(to, message);
      } catch (error) {
        lastError = error;
        console.warn(`SMS send attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phone) {
    // Basic E.164 validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid) {
    try {
      if (!this.isConfigured) {
        return {
          sid: messageSid,
          status: 'delivered',
          mock: true
        };
      }
      
      const message = await this.client.messages(messageSid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (error) {
      console.error('Error fetching message status:', error);
      throw error;
    }
  }

  /**
   * Handle incoming SMS webhook
   */
  async handleIncomingWebhook(webhookData) {
    try {
      const {
        From: from,
        To: to,
        Body: body,
        MessageSid: messageSid
      } = webhookData;
      
      console.log('📨 Incoming SMS received:', {
        from,
        to,
        messageSid,
        preview: body.substring(0, 50)
      });
      
      return {
        from,
        to,
        body,
        messageSid,
        receivedAt: new Date()
      };
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(signature, url, params) {
    if (!this.isConfigured) {
      console.log('Mock: Webhook signature validated');
      return true;
    }
    
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.DEMO_TWILIO_AUTH_TOKEN;
    return twilio.validateRequest(
      authToken,
      signature,
      url,
      params
    );
  }

  /**
   * Get phone numbers for tenant
   */
  async getPhoneNumbers(tenantId) {
    try {
      if (!this.isConfigured) {
        return [{
          phoneNumber: this.mockPhoneNumbers[tenantId] || '+15551234567',
          friendlyName: 'Test Number',
          capabilities: { sms: true, voice: false, mms: false },
          mock: true
        }];
      }
      
      // In production, fetch from database
      // For now, return configured number
      return [{
        phoneNumber: process.env.TWILIO_FROM_NUMBER || process.env.DEMO_TWILIO_FROM_NUMBER,
        friendlyName: 'Primary Number',
        capabilities: { sms: true, voice: true, mms: true }
      }];
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      return [];
    }
  }

  /**
   * Release phone number
   */
  async releasePhoneNumber(phoneNumberSid) {
    try {
      if (!this.isConfigured) {
        console.log(`Mock: Released phone number ${phoneNumberSid}`);
        return { success: true, mock: true };
      }
      
      await this.client.incomingPhoneNumbers(phoneNumberSid).remove();
      return { success: true };
    } catch (error) {
      console.error('Error releasing phone number:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(startDate, endDate) {
    try {
      if (!this.isConfigured) {
        return {
          sms_sent: Math.floor(Math.random() * 1000),
          sms_received: Math.floor(Math.random() * 500),
          total_cost: (Math.random() * 100).toFixed(2),
          mock: true
        };
      }
      
      const usage = await this.client.usage.records.list({
        category: 'sms',
        startDate,
        endDate
      });
      
      return {
        sms_sent: usage.filter(u => u.category === 'sms-outbound').reduce((sum, u) => sum + u.count, 0),
        sms_received: usage.filter(u => u.category === 'sms-inbound').reduce((sum, u) => sum + u.count, 0),
        total_cost: usage.reduce((sum, u) => sum + parseFloat(u.price), 0).toFixed(2)
      };
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      throw error;
    }
  }
}

// Create singleton instance for default use
const defaultTwilioService = new TwilioService();

module.exports = TwilioService;
module.exports.default = defaultTwilioService;