/**
 * Follow Up Boss CRM Adapter
 * Handles all FUB API interactions for multi-tenant system
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

class FollowUpBossAdapter {
  constructor(crmConfig) {
    this.config = crmConfig;
    this.credentials = crmConfig.credentials || {};
    this.fieldMappings = crmConfig.field_mappings || {};
    this.baseUrl = crmConfig.config?.base_url || 'https://api.followupboss.com/v1';
    
    // Initialize Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Setup axios instance with auth
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${Buffer.from(this.credentials.apiKey + ':').toString('base64')}`,
        'X-System': this.config.config?.x_system || 'Aim-Assist',
        'X-System-Key': this.credentials.xSystemKey || '',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Sync a message to FUB text messages
   */
  async syncMessage(leadId, message) {
    try {
      console.log(`📤 Syncing message to FUB for lead ${leadId}`);
      
      // Get the FUB lead ID from our database
      const { data: lead } = await this.supabase
        .from('leads')
        .select('fub_lead_id, first_name, last_name')
        .eq('id', leadId)
        .single();

      if (!lead?.fub_lead_id) {
        console.error('❌ Lead does not have FUB ID');
        return { success: false, error: 'No FUB ID for lead' };
      }

      // Get the lead's phone number
      const { data: phone } = await this.supabase
        .from('lead_phones')
        .select('phone')
        .eq('lead_id', leadId)
        .eq('is_primary', true)
        .single();

      if (!phone?.phone) {
        console.error('❌ No phone number found for lead');
        return { success: false, error: 'No phone number' };
      }

      // Format message for FUB
      const fubMessage = {
        personId: lead.fub_lead_id,
        userId: this.config.config?.user_id || '1', // FUB user ID
        message: message.content,
        toNumber: phone.phone,
        // If outbound, we're sending TO the lead
        // If inbound, we received FROM the lead
        isIncoming: message.direction === 'inbound'
      };

      // Post to FUB text messages endpoint
      const response = await this.api.post('/textMessages', fubMessage);

      console.log(`✅ Message synced to FUB: ${response.data.id}`);
      
      // Update our message with FUB reference
      await this.supabase
        .from('messages')
        .update({ 
          provider_message_id: String(response.data.id),
          provider_status: 'synced'
        })
        .eq('id', message.id);

      return {
        success: true,
        fubMessageId: response.data.id
      };

    } catch (error) {
      console.error('❌ Failed to sync message to FUB:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }

  /**
   * Fetch a lead from FUB
   */
  async fetchLead(fubLeadId) {
    try {
      const response = await this.api.get(`/people/${fubLeadId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch lead from FUB:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch conversation history from FUB
   */
  async fetchConversationHistory(fubLeadId) {
    try {
      console.log(`📥 Fetching conversation history for FUB lead ${fubLeadId}`);
      
      const response = await this.api.get('/textMessages', {
        params: {
          personId: fubLeadId,
          limit: 100,
          sort: '-created'
        }
      });

      const messages = response.data.textMessages || [];
      
      console.log(`✅ Fetched ${messages.length} messages from FUB`);
      
      // Format messages for our system
      return messages.map(msg => ({
        fub_id: msg.id,
        content: msg.message,
        direction: msg.isIncoming ? 'inbound' : 'outbound',
        sender_type: msg.isIncoming ? 'lead' : 
                     (msg.userId === '0' ? 'ai' : 'agent'),
        created_at: msg.created,
        phone: msg.isIncoming ? msg.fromNumber : msg.toNumber
      }));

    } catch (error) {
      console.error('Failed to fetch conversation history:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Update lead custom fields in FUB
   */
  async updateLeadCustomFields(fubLeadId, fields) {
    try {
      console.log(`📝 Updating FUB lead ${fubLeadId} custom fields`);
      
      // Map our field names to FUB custom field names
      const customFields = {};
      
      if (fields.ai_status !== undefined) {
        customFields[this.fieldMappings.custom_ai_status || 'customEugeniaTalkingStatus'] = fields.ai_status;
      }
      
      if (fields.ai_link !== undefined) {
        customFields[this.fieldMappings.custom_ai_link || 'customAimAssist'] = fields.ai_link;
      }
      
      if (fields.ai_paused_until !== undefined) {
        customFields[this.fieldMappings.custom_ai_paused || 'customEugeniaPausedUntil'] = fields.ai_paused_until;
      }

      const response = await this.api.put(`/people/${fubLeadId}`, customFields);
      
      console.log('✅ Custom fields updated in FUB');
      return { success: true };

    } catch (error) {
      console.error('Failed to update FUB custom fields:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search for leads by phone number
   */
  async findLeadByPhone(phoneNumber) {
    try {
      // Normalize phone for search
      const normalized = phoneNumber.replace(/\D/g, '');
      
      // Search in FUB
      const response = await this.api.get('/people', {
        params: {
          phone: normalized,
          limit: 1
        }
      });

      if (response.data.people && response.data.people.length > 0) {
        return response.data.people[0];
      }

      return null;

    } catch (error) {
      console.error('Failed to find lead by phone:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Create a new lead in FUB
   */
  async createLead(leadData) {
    try {
      const fubLead = {
        firstName: leadData.first_name,
        lastName: leadData.last_name,
        emails: leadData.email ? [{ value: leadData.email }] : [],
        phones: leadData.phone ? [{ value: leadData.phone }] : [],
        source: leadData.source || 'Aim Assist',
        tags: leadData.tags || []
      };

      const response = await this.api.post('/people', fubLead);
      
      console.log(`✅ Lead created in FUB: ${response.data.id}`);
      return response.data;

    } catch (error) {
      console.error('Failed to create lead in FUB:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const response = await this.api.get('/people', { params: { limit: 1 } });
      return { success: true, message: 'FUB connection successful' };
    } catch (error) {
      return { 
        success: false, 
        message: 'FUB connection failed',
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }
}

module.exports = FollowUpBossAdapter;