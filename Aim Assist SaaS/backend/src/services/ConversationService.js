/**
 * Manages conversations and messages
 * Tracks full conversation history per lead
 * Handles message storage and retrieval
 */

const { supabase } = require('../config/supabase');

class ConversationService {
  constructor(tenantId) {
    this.tenantId = tenantId;
  }

  /**
   * Get conversation history for a lead
   */
  async getHistory(leadId, limit = 100) {
    try {
      // First get or create the conversation
      const conversation = await this.getOrCreateConversation(leadId);
      
      if (!conversation) {
        return [];
      }
      
      // Then get the messages
      return await this.getMessages(conversation.id, limit);
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Get or create conversation for lead
   */
  async getOrCreateConversation(crmLeadId) {
    try {
      if (!supabase) {
        throw new Error('Supabase not configured - cannot create conversation');
      }
      
      // First get the database lead ID from CRM lead ID
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id')
        .eq('tenant_id', this.tenantId)
        .eq('crm_lead_id', crmLeadId)
        .single();
      
      if (leadError || !lead) {
        throw new Error(`Lead not found in database for CRM ID ${crmLeadId}: ${leadError?.message || 'No lead found'}`);
      }
      
      const dbLeadId = lead.id;
      
      // Check for existing conversation
      let { data: conversation, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('lead_id', dbLeadId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // No conversation exists, create one
        const result = await supabase
          .from('conversations')
          .insert([{
            tenant_id: this.tenantId,
            lead_id: dbLeadId,
            channel_type: 'sms',  // Added required field
            status: 'active',
            ai_enabled: true,
            metadata: { crm_lead_id: crmLeadId }
          }])
          .select()
          .single();
        
        if (result.error) {
          console.error('Error creating conversation:', result.error);
          return null;
        }
        
        conversation = result.data;
      }
      
      return conversation;
    } catch (error) {
      console.error('Error getting/creating conversation:', error);
      throw error;
    }
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, messageData) {
    try {
      if (!supabase) {
        const mockMessage = {
          id: 'msg-' + Date.now(),
          conversation_id: conversationId,
          tenant_id: this.tenantId,
          ...messageData,
          created_at: new Date()
        };
        console.log('Mock message added:', mockMessage);
        return mockMessage;
      }
      
      const messageToInsert = {
        conversation_id: conversationId,
        tenant_id: this.tenantId,
        ...messageData
      };
      
      console.log('📝 Inserting message:', JSON.stringify(messageToInsert, null, 2));
      
      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select()
        .single();
      
      if (error) throw error;
      
      // Update conversation message count and last message time
      // Note: Supabase JS client doesn't support raw SQL in update, need to fetch and increment
      const { data: conv } = await supabase
        .from('conversations')
        .select('message_count')
        .eq('id', conversationId)
        .single();
      
      await supabase
        .from('conversations')
        .update({
          message_count: (conv?.message_count || 0) + 1,
          last_message_at: new Date(),
          [`last_${messageData.sender_type}_message_at`]: new Date()
        })
        .eq('id', conversationId);
      
      return data;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  /**
   * Get conversation messages
   */
  async getMessages(conversationId, limit = 100) {
    try {
      if (!supabase) {
        return [
          {
            id: 'msg-1',
            conversation_id: conversationId,
            direction: 'outbound',
            sender_type: 'ai',
            content: 'Hi! How can I help you today?',
            created_at: new Date(Date.now() - 3600000)
          },
          {
            id: 'msg-2',
            conversation_id: conversationId,
            direction: 'inbound',
            sender_type: 'lead',
            content: 'I\'m interested in viewing some properties',
            created_at: new Date(Date.now() - 1800000)
          }
        ];
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  /**
   * Get all conversations for tenant
   */
  async getAllConversations(filters = {}) {
    try {
      if (!supabase) {
        return [
          {
            id: 'conv-1',
            tenant_id: this.tenantId,
            lead: { first_name: 'John', last_name: 'Doe' },
            status: 'active',
            message_count: 5,
            last_message_at: new Date()
          }
        ];
      }
      
      let query = supabase
        .from('conversations')
        .select(`
          *,
          leads (
            id,
            first_name,
            last_name,
            phone,
            email
          )
        `)
        .eq('tenant_id', this.tenantId);
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.ai_enabled !== undefined) {
        query = query.eq('ai_enabled', filters.ai_enabled);
      }
      
      const { data, error } = await query
        .order('last_message_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId, updates) {
    try {
      if (!supabase) {
        console.log('Mock message status update:', { messageId, updates });
        return true;
      }
      
      const { error } = await supabase
        .from('messages')
        .update(updates)
        .eq('id', messageId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating message status:', error);
      return false;
    }
  }

  /**
   * Mark conversation as qualified
   */
  async markQualified(conversationId, reason) {
    try {
      if (!supabase) {
        console.log('Mock conversation qualified:', { conversationId, reason });
        return true;
      }
      
      const { error } = await supabase
        .from('conversations')
        .update({
          qualification_status: 'qualified',
          qualified_at: new Date(),
          qualification_reason: reason
        })
        .eq('id', conversationId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking conversation qualified:', error);
      return false;
    }
  }

  /**
   * Get conversation statistics
   */
  async getStats() {
    try {
      if (!supabase) {
        return {
          total_conversations: 25,
          active_conversations: 10,
          qualified_leads: 5,
          average_messages_per_conversation: 8.5,
          conversations_today: 3
        };
      }
      
      const conversations = await this.getAllConversations();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const stats = {
        total_conversations: conversations.length,
        active_conversations: conversations.filter(c => c.status === 'active').length,
        qualified_leads: conversations.filter(c => c.qualification_status === 'qualified').length,
        average_messages_per_conversation: 0,
        conversations_today: 0
      };
      
      // Calculate average messages
      const totalMessages = conversations.reduce((sum, c) => sum + (c.message_count || 0), 0);
      stats.average_messages_per_conversation = conversations.length > 0 
        ? (totalMessages / conversations.length).toFixed(1) 
        : 0;
      
      // Count today's conversations
      stats.conversations_today = conversations.filter(c => {
        const lastMessage = c.last_message_at ? new Date(c.last_message_at) : null;
        return lastMessage && lastMessage >= today;
      }).length;
      
      return stats;
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      throw error;
    }
  }

  /**
   * Format conversation history for AI
   */
  formatForAI(messages) {
    return messages.map(msg => {
      const sender = msg.sender_type === 'lead' ? 'Lead' : 
                    msg.sender_type === 'ai' ? 'AI' : 'Agent';
      const time = new Date(msg.created_at).toLocaleTimeString();
      return `[${time}] ${sender}: ${msg.content}`;
    }).join('\n');
  }

  /**
   * Check for escalation keywords
   */
  checkForEscalation(message) {
    const escalationKeywords = [
      'speak to someone',
      'talk to agent',
      'human',
      'real person',
      'call me',
      'phone call',
      'schedule',
      'appointment',
      'viewing',
      'tour',
      'stop',
      'unsubscribe',
      'opt out'
    ];
    
    const lowerMessage = message.toLowerCase();
    return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Pause AI for conversation
   */
  async pauseAI(conversationId, reason = null) {
    try {
      if (!supabase) {
        console.log('Mock AI paused for conversation:', conversationId);
        return true;
      }
      
      const { error } = await supabase
        .from('conversations')
        .update({
          ai_enabled: false,
          status: 'paused',
          qualification_reason: reason
        })
        .eq('id', conversationId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error pausing AI:', error);
      return false;
    }
  }
}

module.exports = ConversationService;