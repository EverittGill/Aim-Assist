/**
 * Message Recovery Service
 * Recovers SMS messages that were missed during server downtime
 */

class MessageRecoveryService {
  constructor(twilioService, fubService, geminiService, conversationService) {
    this.twilioService = twilioService;
    this.fubService = fubService;
    this.geminiService = geminiService;
    this.conversationService = conversationService;
    this.isRecovering = false;
    this.lastRecoveryTime = null;
  }

  /**
   * Start the recovery process - checks for missed messages
   * @param {number} lookbackMinutes - How far back to check (default 60 minutes)
   */
  async recoverMissedMessages(lookbackMinutes = 60) {
    if (this.isRecovering) {
      console.log('⏳ Message recovery already in progress, skipping...');
      return { skipped: true };
    }

    this.isRecovering = true;
    const startTime = new Date();
    
    try {
      console.log(`\n🔄 Starting message recovery (looking back ${lookbackMinutes} minutes)...`);
      
      // Calculate the time window
      const lookbackTime = new Date(Date.now() - (lookbackMinutes * 60 * 1000));
      
      // Fetch messages from Twilio
      const messages = await this.fetchRecentMessages(lookbackTime);
      console.log(`📨 Found ${messages.length} messages from Twilio since ${lookbackTime.toISOString()}`);
      
      // Process each message
      const results = {
        total: messages.length,
        processed: 0,
        alreadyProcessed: 0,
        errors: 0,
        messages: []
      };
      
      for (const message of messages) {
        try {
          const result = await this.processMessage(message);
          if (result.processed) {
            results.processed++;
          } else if (result.alreadyProcessed) {
            results.alreadyProcessed++;
          }
          results.messages.push(result);
        } catch (error) {
          console.error(`❌ Error processing message ${message.sid}:`, error.message);
          results.errors++;
          results.messages.push({
            sid: message.sid,
            error: error.message
          });
        }
      }
      
      const duration = (new Date() - startTime) / 1000;
      console.log(`✅ Message recovery completed in ${duration}s`);
      console.log(`   Processed: ${results.processed}`);
      console.log(`   Already processed: ${results.alreadyProcessed}`);
      console.log(`   Errors: ${results.errors}`);
      
      this.lastRecoveryTime = new Date();
      return results;
      
    } catch (error) {
      console.error('❌ Message recovery failed:', error);
      throw error;
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Fetch recent messages from Twilio
   */
  async fetchRecentMessages(since) {
    try {
      const client = this.twilioService.client;
      const messages = await client.messages.list({
        to: process.env.TWILIO_FROM_NUMBER,
        dateSentAfter: since,
        limit: 100 // Adjust if needed
      });
      
      // Filter to only inbound messages
      return messages.filter(msg => 
        msg.direction === 'inbound' && 
        msg.to === process.env.TWILIO_FROM_NUMBER
      );
    } catch (error) {
      console.error('Failed to fetch messages from Twilio:', error);
      throw error;
    }
  }

  /**
   * Process a single message
   */
  async processMessage(twilioMessage) {
    const result = {
      sid: twilioMessage.sid,
      from: twilioMessage.from,
      body: twilioMessage.body,
      dateSent: twilioMessage.dateSent,
      processed: false,
      alreadyProcessed: false
    };
    
    console.log(`\n🔍 Checking message ${twilioMessage.sid} from ${twilioMessage.from}`);
    
    // Look up lead by phone
    const lead = await this.fubService.findLeadByPhone(twilioMessage.from);
    if (!lead) {
      console.log('⚠️  No lead found for this number');
      result.error = 'No lead found';
      return result;
    }
    
    console.log(`📋 Lead found: ${lead.name} (ID: ${lead.id})`);
    
    // Check if message already exists in FUB
    const messageExists = await this.checkMessageExists(lead.id, twilioMessage);
    if (messageExists) {
      console.log('✓ Message already processed');
      result.alreadyProcessed = true;
      return result;
    }
    
    console.log('📤 Processing missed message...');
    
    // Process the message through the normal flow
    await this.processIncomingMessage(lead, twilioMessage);
    
    result.processed = true;
    result.leadId = lead.id;
    result.leadName = lead.name;
    
    return result;
  }

  /**
   * Check if a message already exists in FUB
   */
  async checkMessageExists(leadId, twilioMessage) {
    try {
      // Get messages from FUB storage
      const messagesData = await this.fubService.getLeadNotesData(leadId);
      const messages = messagesData?.conversations || [];
      
      // Check if any message matches this Twilio SID or has same content/timestamp
      const exists = messages.some(msg => {
        // Check by Twilio SID
        if (msg.twilioSid === twilioMessage.sid) return true;
        
        // Check by content and approximate timestamp (within 5 minutes)
        if (msg.content === twilioMessage.body && msg.direction === 'inbound') {
          const msgTime = new Date(msg.timestamp);
          const twilioTime = new Date(twilioMessage.dateSent);
          const timeDiff = Math.abs(msgTime - twilioTime) / 1000 / 60; // minutes
          return timeDiff < 5;
        }
        
        return false;
      });
      
      return exists;
    } catch (error) {
      console.error('Error checking message existence:', error);
      // If we can't check, assume it doesn't exist to avoid missing messages
      return false;
    }
  }

  /**
   * Process an incoming message (similar to webhook handler)
   */
  async processIncomingMessage(lead, twilioMessage) {
    // Store the message in FUB
    await this.fubService.addMessageToLeadStorage(lead.id, {
      direction: 'inbound',
      type: 'sms',
      content: twilioMessage.body,
      twilioSid: twilioMessage.sid,
      timestamp: twilioMessage.dateSent
    });
    
    // Log to FUB text messages if possible
    try {
      await this.fubService.logTextMessage(
        lead.id,
        twilioMessage.body,
        'inbound',
        twilioMessage.from,
        twilioMessage.to
      );
    } catch (error) {
      console.log('Could not log to FUB text messages:', error.message);
    }
    
    // Check if AI should respond
    const statusField = lead.customFields?.find(
      cf => cf.name === process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME
    )?.value;
    
    if (statusField === 'inactive') {
      console.log('AI is paused for this lead, not generating response');
      return;
    }
    
    // Get conversation history and generate AI response
    const conversationHistory = await this.conversationService.getConversationHistory(lead.id);
    const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
    
    const aiResponse = await this.geminiService.generateReply(
      lead,
      conversationHistory,
      twilioMessage.body,
      agencyName
    );
    
    if (aiResponse && aiResponse.message) {
      // Queue the response (with shorter delay for recovery)
      await this.twilioService.queueSMS(
        twilioMessage.from,
        aiResponse.message,
        {
          leadId: lead.id,
          direction: 'outbound',
          fromNumber: process.env.TWILIO_FROM_NUMBER,
          delay: 5000, // 5 second delay for recovered messages
          priority: 2  // Lower priority than real-time messages
        }
      );
      
      console.log('✅ AI response queued for recovered message');
    }
  }

  /**
   * Start periodic recovery checks
   * @param {number} intervalMinutes - How often to check (default 5 minutes)
   */
  startPeriodicRecovery(intervalMinutes = 5) {
    console.log(`🔄 Starting periodic message recovery every ${intervalMinutes} minutes`);
    
    // Run immediately on start
    this.recoverMissedMessages(60).catch(error => {
      console.error('Initial recovery failed:', error);
    });
    
    // Then run periodically
    this.recoveryInterval = setInterval(() => {
      // Only look back since last recovery (or 15 minutes if first run)
      const lookback = this.lastRecoveryTime 
        ? Math.ceil((Date.now() - this.lastRecoveryTime) / 1000 / 60) + 1
        : 15;
        
      this.recoverMissedMessages(lookback).catch(error => {
        console.error('Periodic recovery failed:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop periodic recovery
   */
  stopPeriodicRecovery() {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
      console.log('🛑 Stopped periodic message recovery');
    }
  }
}

module.exports = MessageRecoveryService;