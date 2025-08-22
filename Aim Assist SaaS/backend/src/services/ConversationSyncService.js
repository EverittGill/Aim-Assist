/**
 * Conversation Sync Service
 * Ensures Supabase has complete conversation history from CRM
 * Critical for AI context awareness of human agent interactions
 */

const { supabase } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');

class ConversationSyncService {
  constructor(tenantId) {
    this.tenantId = tenantId;
  }

  /**
   * Sync conversation from CRM before AI processing
   * This ensures AI has context of ANY messages sent by human agents
   */
  async syncConversationBeforeAI(leadId) {
    console.log(`🔄 Syncing conversation for lead ${leadId} before AI response`);
    
    try {
      // Get CRM adapter
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      
      // Fetch ALL messages from CRM (including human agent messages)
      const crmMessages = await adapter.getConversationHistory(leadId, {
        limit: 500 // Get extensive history
      });
      
      if (!crmMessages || crmMessages.length === 0) {
        console.log('No CRM messages found');
        return { messages: [], hasHumanActivity: false };
      }
      
      console.log(`📥 Found ${crmMessages.length} messages in CRM`);
      
      // Get existing messages from Supabase
      const { data: existingMessages, error } = await supabase
        .from('messages')
        .select('external_id, crm_message_id')
        .eq('tenant_id', this.tenantId)
        .eq('lead_id', leadId);
      
      if (error) {
        console.error('Error fetching existing messages:', error);
      }
      
      const existingIds = new Set(
        (existingMessages || []).map(m => m.crm_message_id || m.external_id)
      );
      
      // Find new messages from CRM that we don't have
      const newMessages = crmMessages.filter(msg => 
        !existingIds.has(msg.id) && !existingIds.has(msg.external_id)
      );
      
      console.log(`📝 ${newMessages.length} new messages to sync from CRM`);
      
      // Check for recent human activity
      const recentHumanMessages = crmMessages.filter(msg => {
        const isRecent = new Date(msg.created_at) > new Date(Date.now() - 2 * 60 * 60 * 1000); // Last 2 hours
        const isHuman = msg.sender_type === 'human' || msg.sender_type === 'agent';
        return isRecent && isHuman;
      });
      
      const hasHumanActivity = recentHumanMessages.length > 0;
      
      if (hasHumanActivity) {
        console.log(`⚠️ Human agent activity detected! ${recentHumanMessages.length} messages in last 2 hours`);
      }
      
      // Store new messages in Supabase
      if (newMessages.length > 0) {
        const messagesToInsert = newMessages.map(msg => ({
          tenant_id: this.tenantId,
          lead_id: leadId,
          crm_message_id: msg.id,
          external_id: msg.external_id,
          direction: msg.direction,
          sender_type: msg.sender_type,
          content: msg.content || msg.message,
          channel_type: 'sms',
          metadata: {
            from: msg.from,
            to: msg.to,
            crm_user_id: msg.crm_user_id,
            original: msg
          },
          created_at: msg.created_at || new Date()
        }));
        
        const { error: insertError } = await supabase
          .from('messages')
          .insert(messagesToInsert);
        
        if (insertError) {
          console.error('Error inserting synced messages:', insertError);
        } else {
          console.log(`✅ Synced ${newMessages.length} new messages from CRM`);
        }
      }
      
      // Return full conversation history and human activity flag
      return {
        messages: crmMessages,
        hasHumanActivity,
        humanMessages: recentHumanMessages
      };
      
    } catch (error) {
      console.error('Error syncing conversation:', error);
      return { messages: [], hasHumanActivity: false };
    }
  }

  /**
   * Check if human agent is actively engaged
   */
  async checkHumanEngagement(leadId) {
    try {
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      
      // Get recent messages
      const messages = await adapter.getConversationHistory(leadId, { limit: 20 });
      
      // Check last 5 messages for human activity
      const recentMessages = messages.slice(0, 5);
      const humanMessageCount = recentMessages.filter(m => 
        m.sender_type === 'human' || m.sender_type === 'agent'
      ).length;
      
      // If 2+ of last 5 messages are from human, they're engaged
      if (humanMessageCount >= 2) {
        console.log('🤝 Human agent is actively engaged - AI should pause');
        return true;
      }
      
      // Check if last message is from human within 30 minutes
      const lastMessage = messages[0];
      if (lastMessage && 
          (lastMessage.sender_type === 'human' || lastMessage.sender_type === 'agent')) {
        const messageAge = Date.now() - new Date(lastMessage.created_at).getTime();
        if (messageAge < 30 * 60 * 1000) { // 30 minutes
          console.log('🤝 Human sent message recently - AI should pause');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking human engagement:', error);
      return false; // Default to not blocking AI
    }
  }

  /**
   * Log outgoing message to both Supabase and CRM
   */
  async logOutgoingMessage(leadId, message) {
    try {
      // Store in Supabase first (primary)
      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert({
          tenant_id: this.tenantId,
          lead_id: leadId,
          direction: 'outbound',
          sender_type: message.sender_type || 'ai',
          content: message.content,
          channel_type: 'sms',
          metadata: message.metadata || {}
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error saving message to Supabase:', error);
      }
      
      // Then log to CRM for visibility
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      const logged = await adapter.logMessage(leadId, {
        direction: 'outbound',
        content: message.content,
        from: message.from || process.env.DEMO_TWILIO_FROM_NUMBER,
        to: message.to
      });
      
      if (logged) {
        console.log('✅ Message logged to CRM');
        
        // Update Supabase record with CRM ID if available
        if (savedMessage && logged.id) {
          await supabase
            .from('messages')
            .update({ crm_message_id: logged.id })
            .eq('id', savedMessage.id);
        }
      }
      
      return savedMessage;
    } catch (error) {
      console.error('Error logging outgoing message:', error);
      throw error;
    }
  }

  /**
   * Get complete conversation history with CRM sync
   */
  async getFullConversation(leadId) {
    // First sync from CRM
    const syncResult = await this.syncConversationBeforeAI(leadId);
    
    // Then get all messages from Supabase (now complete)
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching messages:', error);
      return { messages: [], hasHumanActivity: syncResult.hasHumanActivity };
    }
    
    return {
      messages: messages || [],
      hasHumanActivity: syncResult.hasHumanActivity,
      humanMessages: syncResult.humanMessages
    };
  }
}

module.exports = ConversationSyncService;