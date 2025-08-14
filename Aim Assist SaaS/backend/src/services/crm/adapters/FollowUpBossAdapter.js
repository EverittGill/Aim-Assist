/**
 * FUB implementation of CRM adapter
 * Handles API authentication with Basic Auth
 * Maps FUB fields to Aim Assist standard schema
 * Manages lead CRUD and conversation logging
 */

const CRMAdapter = require('../CRMAdapter');
const axios = require('axios');

class FollowUpBossAdapter extends CRMAdapter {
  constructor(tenantId, config) {
    super(tenantId, config);
    
    // Validate required credentials
    const { api_key, x_system, x_system_key } = this.credentials;
    if (!api_key || !x_system || !x_system_key) {
      throw new Error('FUB requires api_key, x_system, and x_system_key');
    }
    
    this.baseUrl = 'https://api.followupboss.com/v1';
    this.basicAuth = Buffer.from(`${api_key}:`).toString('base64');
    
    // Override default field mappings for FUB
    this.fieldMappings = {
      first_name: 'firstName',
      last_name: 'lastName', 
      email: 'email',
      phone: 'phone',
      source: 'source',
      tags: 'tags',
      stage: 'stage',
      assigned_to: 'assignedUserId',
      created_at: 'created',
      updated_at: 'updated',
      notes: 'background'
    };
  }

  /**
   * Get request headers for FUB API
   */
  getHeaders() {
    return {
      'Authorization': `Basic ${this.basicAuth}`,
      'X-System': this.credentials.x_system,
      'X-System-Key': this.credentials.x_system_key,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    };
  }

  /**
   * Test FUB connection
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/people`, {
        headers: this.getHeaders(),
        params: { limit: 1 }
      });
      return response.status === 200;
    } catch (error) {
      console.error('FUB connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get leads from FUB
   */
  async getLeads(options = {}) {
    const { limit = 100, offset = 0, filters = {} } = options;
    
    try {
      const params = {
        limit,
        offset,
        sort: '-created'
      };
      
      // Add search query if phone filter provided
      if (filters.phone) {
        params.q = filters.phone;
      }
      
      const response = await axios.get(`${this.baseUrl}/people`, {
        headers: this.getHeaders(),
        params
      });
      
      const leads = response.data.people || [];
      
      // Map to standard schema
      return leads.map(lead => this.mapFUBToStandard(lead));
    } catch (error) {
      console.error('Error fetching FUB leads:', error.message);
      throw error;
    }
  }

  /**
   * Get single lead by ID
   */
  async getLead(leadId) {
    try {
      const response = await axios.get(`${this.baseUrl}/people/${leadId}`, {
        headers: this.getHeaders()
      });
      
      return this.mapFUBToStandard(response.data);
    } catch (error) {
      console.error('Error fetching FUB lead:', error.message);
      throw error;
    }
  }

  /**
   * Create lead in FUB
   */
  async createLead(leadData) {
    try {
      const fubData = this.mapStandardToFUB(leadData);
      
      const response = await axios.post(`${this.baseUrl}/people`, fubData, {
        headers: this.getHeaders()
      });
      
      return this.mapFUBToStandard(response.data);
    } catch (error) {
      console.error('Error creating FUB lead:', error.message);
      throw error;
    }
  }

  /**
   * Update lead in FUB
   */
  async updateLead(leadId, updates) {
    try {
      const fubData = this.mapStandardToFUB(updates);
      
      const response = await axios.put(`${this.baseUrl}/people/${leadId}`, fubData, {
        headers: this.getHeaders()
      });
      
      return this.mapFUBToStandard(response.data);
    } catch (error) {
      console.error('Error updating FUB lead:', error.message);
      throw error;
    }
  }

  /**
   * Delete lead from FUB
   */
  async deleteLead(leadId) {
    try {
      await axios.delete(`${this.baseUrl}/people/${leadId}`, {
        headers: this.getHeaders()
      });
      return true;
    } catch (error) {
      console.error('Error deleting FUB lead:', error.message);
      return false;
    }
  }

  /**
   * Log SMS message to FUB
   */
  async logMessage(leadId, message) {
    try {
      const messageData = {
        personId: leadId,
        message: message.content,
        toNumber: message.direction === 'outbound' ? message.to : null,
        fromNumber: message.direction === 'inbound' ? message.from : null,
        createdUserId: this.credentials.user_id || null
      };
      
      const response = await axios.post(`${this.baseUrl}/textMessages`, messageData, {
        headers: this.getHeaders()
      });
      
      return response.status === 200 || response.status === 201;
    } catch (error) {
      console.error('Error logging message to FUB:', error.message);
      return false;
    }
  }

  /**
   * Get conversation history from FUB
   */
  async getConversationHistory(leadId, options = {}) {
    const { limit = 100 } = options;
    
    try {
      const response = await axios.get(`${this.baseUrl}/textMessages`, {
        headers: this.getHeaders(),
        params: {
          personId: leadId,
          limit,
          sort: '-created'
        }
      });
      
      const messages = response.data.textMessages || [];
      
      return messages.map(msg => ({
        id: msg.id,
        direction: msg.toNumber ? 'outbound' : 'inbound',
        content: msg.message,
        from: msg.fromNumber,
        to: msg.toNumber,
        created_at: msg.created,
        sender_type: msg.createdUserId ? 'human' : 'ai'
      }));
    } catch (error) {
      console.error('Error fetching FUB conversation:', error.message);
      return [];
    }
  }

  /**
   * Update custom fields in FUB
   */
  async updateCustomFields(leadId, customFields) {
    try {
      const customFieldsArray = Object.entries(customFields).map(([name, value]) => ({
        name,
        value: value?.toString() || ''
      }));
      
      const response = await axios.put(`${this.baseUrl}/people/${leadId}`, {
        customFields: customFieldsArray
      }, {
        headers: this.getHeaders()
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('Error updating FUB custom fields:', error.message);
      return false;
    }
  }

  /**
   * Map FUB lead to standard schema
   */
  mapFUBToStandard(fubLead) {
    const phone = fubLead.phones?.find(p => p.isPrimary)?.value || 
                  fubLead.phones?.[0]?.value || null;
    
    const email = fubLead.emails?.find(e => e.isPrimary)?.value || 
                  fubLead.emails?.[0]?.value || null;
    
    return {
      crm_lead_id: fubLead.id?.toString(),
      first_name: fubLead.firstName,
      last_name: fubLead.lastName,
      email: email,
      phone: this.normalizePhone(phone),
      source: fubLead.source,
      tags: fubLead.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
      stage: fubLead.stage,
      assigned_to: fubLead.assignedUserId?.toString(),
      notes: fubLead.background,
      custom_fields: fubLead.customFields || [],
      crm_data: fubLead
    };
  }

  /**
   * Map standard lead to FUB format
   */
  mapStandardToFUB(standardLead) {
    const fubData = {};
    
    if (standardLead.first_name) fubData.firstName = standardLead.first_name;
    if (standardLead.last_name) fubData.lastName = standardLead.last_name;
    if (standardLead.source) fubData.source = standardLead.source;
    if (standardLead.stage) fubData.stage = standardLead.stage;
    if (standardLead.notes) fubData.background = standardLead.notes;
    
    if (standardLead.email) {
      fubData.emails = [{ value: standardLead.email, isPrimary: true }];
    }
    
    if (standardLead.phone) {
      fubData.phones = [{ value: standardLead.phone, isPrimary: true }];
    }
    
    if (standardLead.tags && standardLead.tags.length > 0) {
      fubData.tags = standardLead.tags;
    }
    
    return fubData;
  }

  /**
   * Subscribe to FUB webhooks
   */
  async subscribeToWebhooks(webhookConfig) {
    try {
      const { url, events = ['person.created', 'person.updated'] } = webhookConfig;
      
      const response = await axios.post(`${this.baseUrl}/webhooks`, {
        url,
        events
      }, {
        headers: this.getHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error('Error subscribing to FUB webhooks:', error.message);
      return null;
    }
  }

  /**
   * Process FUB webhook
   */
  processWebhook(webhookData) {
    const { event, data } = webhookData;
    
    switch (event) {
      case 'person.created':
        return {
          type: 'lead_created',
          lead: this.mapFUBToStandard(data)
        };
      
      case 'person.updated':
        return {
          type: 'lead_updated',
          lead: this.mapFUBToStandard(data)
        };
      
      case 'textMessage.created':
        return {
          type: 'message_received',
          message: {
            lead_id: data.personId,
            content: data.message,
            from: data.fromNumber,
            to: data.toNumber
          }
        };
      
      default:
        return { type: 'unknown', data: webhookData };
    }
  }

  /**
   * Get adapter metadata
   */
  getMetadata() {
    return {
      adapter: 'FollowUpBossAdapter',
      version: '1.0.0',
      crm: 'Follow Up Boss',
      capabilities: {
        webhooks: true,
        customFields: true,
        bulkOperations: false,
        conversationHistory: true,
        smsLogging: true
      }
    };
  }
}

module.exports = FollowUpBossAdapter;