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
    
    // Store user_id from settings or credentials
    this.userId = config.settings?.user_id || this.credentials.user_id || null;
    console.log('🔑 FUB Adapter initialized with userId:', this.userId);
    
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
        // Clean phone number for search - remove country code and formatting
        const cleanPhone = filters.phone.replace(/^\+?1/, '').replace(/\D/g, '');
        params.q = cleanPhone;
      }
      
      const response = await axios.get(`${this.baseUrl}/people`, {
        headers: this.getHeaders(),
        params
      });
      
      const leads = response.data.people || [];
      const metadata = response.data._metadata || {};
      
      // Map to standard schema and include pagination info
      return {
        leads: leads.map(lead => this.mapFUBToStandard(lead)),
        total: metadata.total || leads.length,
        hasMore: metadata.next ? true : false,
        nextOffset: offset + leads.length
      };
    } catch (error) {
      console.error('Error fetching FUB leads:', error.message);
      throw error;
    }
  }

  /**
   * Get single lead by ID with ALL fields
   */
  async getLead(leadId, options = {}) {
    const { includeAllFields = true } = options;
    
    try {
      const params = includeAllFields ? { fields: 'allFields' } : {};
      
      const response = await axios.get(`${this.baseUrl}/people/${leadId}`, {
        headers: this.getHeaders(),
        params
      });
      
      return this.mapFUBToStandardComplete(response.data);
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
   * Find lead by phone number
   */
  async findLeadByPhone(phoneNumber) {
    try {
      // Clean phone for search - FUB searches better with just digits
      const cleanPhone = phoneNumber.replace(/^\+?1/, '').replace(/\D/g, '');
      
      console.log(`🔍 Searching for lead with phone: ${cleanPhone}`);
      
      const response = await axios.get(`${this.baseUrl}/people`, {
        headers: this.getHeaders(),
        params: {
          q: cleanPhone,
          limit: 10
        }
      });
      
      const leads = response.data.people || [];
      
      if (leads.length === 0) {
        console.log('No leads found with that phone number');
        return null;
      }
      
      // Find best match - prefer exact phone match
      const exactMatch = leads.find(lead => {
        const phones = lead.phones || [];
        return phones.some(p => {
          const leadPhone = p.value.replace(/\D/g, '');
          return leadPhone.includes(cleanPhone) || cleanPhone.includes(leadPhone);
        });
      });
      
      const match = exactMatch || leads[0];
      console.log(`✅ Found lead: ${match.id} - ${match.name || 'No name'}`);
      
      return this.mapFUBToStandard(match);
    } catch (error) {
      console.error('Error finding lead by phone:', error.message);
      return null;
    }
  }

  /**
   * Log SMS message to FUB
   */
  async logMessage(leadId, message) {
    try {
      // Build message data for FUB
      // Note: FUB text message API has limited fields
      const messageData = {
        personId: parseInt(leadId),
        message: message.content
      };
      
      // Add phone numbers - REQUIRED fields
      // For inbound: from=lead, to=our number
      // For outbound: from=our number, to=lead
      if (message.direction === 'inbound') {
        messageData.fromNumber = message.from; // Lead's number
        messageData.toNumber = message.to;     // Our number
      } else {
        messageData.fromNumber = message.from; // Our number
        messageData.toNumber = message.to;     // Lead's number
      }
      
      console.log('📤 Logging to FUB:', {
        leadId,
        direction: message.direction,
        contentPreview: message.content.substring(0, 50),
        from: messageData.fromNumber,
        to: messageData.toNumber
      });
      
      const response = await axios.post(`${this.baseUrl}/textMessages`, messageData, {
        headers: this.getHeaders()
      });
      
      console.log('✅ FUB message logged successfully');
      return response.status === 200 || response.status === 201;
    } catch (error) {
      console.error('❌ Error logging message to FUB:', error.response?.data || error.message);
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
   * Map FUB lead to standard schema (basic)
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
      phones: fubLead.phones || [],  // Include full phones array for TagPollingService
      emails: fubLead.emails || [],  // Include full emails array too
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
   * Map FUB lead to standard schema with ALL fields for complete sync
   */
  mapFUBToStandardComplete(fubLead) {
    // Get primary contacts
    const primaryPhone = fubLead.phones?.find(p => p.isPrimary) || fubLead.phones?.[0];
    const primaryEmail = fubLead.emails?.find(e => e.isPrimary) || fubLead.emails?.[0];
    
    // Extract all custom fields into a clean object
    const customFields = {};
    Object.keys(fubLead).forEach(key => {
      if (key.startsWith('custom')) {
        customFields[key.substring(6)] = fubLead[key]; // Remove 'custom' prefix
      }
    });
    
    return {
      // Basic identification
      fub_lead_id: fubLead.id?.toString(),
      first_name: fubLead.firstName,
      last_name: fubLead.lastName,
      
      // Contact information (complete arrays)
      phone: this.normalizePhone(primaryPhone?.value),
      email: primaryEmail?.value,
      phones: fubLead.phones || [],
      emails: fubLead.emails || [],
      addresses: fubLead.addresses || [],
      
      // Lead management
      stage: fubLead.stage,
      stage_id: fubLead.stageId,
      source: fubLead.source,
      source_url: fubLead.sourceUrl,
      source_details: fubLead.sourceDetails || {},
      score: fubLead.score,
      temperature: fubLead.temperature,
      tags: fubLead.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
      
      // Assignment
      // assigned_agent_id is UUID in our DB but FUB uses integer, so don't map it directly
      // assigned_agent_id: null, // Would need mapping table from FUB user ID to our agent UUID
      assigned_user_name: fubLead.assignedTo,
      assigned_lender_id: fubLead.assignedLenderId,
      assigned_lender_name: fubLead.assignedLenderName,
      collaborators: fubLead.collaborators || [],
      team_leaders: fubLead.teamLeaders || [],
      
      // Activity timestamps
      last_activity: fubLead.lastActivity,
      last_activity_at: fubLead.lastActivity, // Keep both for compatibility
      last_inbound_at: fubLead.lastInboundActivity,
      last_outbound_at: fubLead.lastOutboundActivity,
      last_communication: fubLead.lastCommunication,
      contacted_at: fubLead.contacted && fubLead.contacted !== 0 ? fubLead.contacted : null,
      replied_at: fubLead.replied && fubLead.replied !== 0 ? fubLead.replied : null,
      
      // Email activity
      last_received_email: fubLead.lastReceivedEmail,
      last_sent_email: fubLead.lastSentEmail,
      last_email: fubLead.lastEmail,
      emails_received: fubLead.emailsReceived || 0,
      emails_sent: fubLead.emailsSent || 0,
      
      // Call activity
      last_incoming_call: fubLead.lastIncomingCall,
      last_outgoing_call: fubLead.lastOutgoingCall,
      last_call: fubLead.lastCall,
      calls_incoming: fubLead.callsIncoming || 0,
      calls_outgoing: fubLead.callsOutgoing || 0,
      calls_duration: fubLead.callsDuration || 0,
      
      // Text activity
      last_received_text: fubLead.lastReceivedText,
      last_sent_text: fubLead.lastSentText,
      last_text: fubLead.lastText,
      texts_received: fubLead.textsReceived || 0,
      texts_sent: fubLead.textsSent || 0,
      
      // Property activity
      properties_viewed: fubLead.propertiesViewed || 0,
      properties_saved: fubLead.propertiesSaved || 0,
      pages_viewed: fubLead.pagesViewed || 0,
      website_visits: fubLead.websiteVisits || 0,
      last_idx_visit: fubLead.lastIdxVisit,
      
      // Deal information
      deal_status: fubLead.dealStatus,
      deal_stage: fubLead.dealStage,
      deal_name: fubLead.dealName,
      deal_close_date: fubLead.dealCloseDate,
      deal_price: fubLead.dealPrice,
      
      // Tasks
      next_task: fubLead.nextTask,
      next_task_has_time: fubLead.nextTaskHasTime,
      next_task_name: fubLead.nextTaskName,
      
      // Timeframe
      timeframe_id: fubLead.timeframeId,
      timeframe_status: fubLead.timeframeStatus,
      timeframe_date_range: fubLead.timeframeDateRange,
      timeframe_updated: fubLead.timeframeUpdated,
      
      // Profile data
      picture: fubLead.picture,
      social_data: fubLead.socialData,
      background: fubLead.background,
      relationships: fubLead.relationships || [],
      
      // System fields
      created_via: fubLead.createdVia,
      created_by_id: fubLead.createdById,
      updated_by_id: fubLead.updatedById,
      lead_flow_id: fubLead.leadFlowId,
      source_id: fubLead.sourceId,
      assigned_pond_id: fubLead.assignedPondId,
      claimed: fubLead.claimed,
      delayed: fubLead.delayed,
      
      // Custom fields (merged with our custom_data)
      custom_data: {
        ...customFields,
        fubCustomFields: fubLead.customFields || []
      },
      
      // Store complete FUB response
      fub_data: fubLead,
      
      // Metadata
      // Don't override Supabase's created_at/updated_at, they're auto-managed
      // created_at: fubLead.created,
      // updated_at: fubLead.updated,
      last_fub_sync: new Date().toISOString()
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
   * Get lead activities from CRM
   * @param {string} leadId - CRM lead ID
   * @param {object} options - Query options
   * @returns {array} Activities array
   */
  async getActivities(leadId, options = {}) {
    try {
      console.log(`📋 Getting activities for lead ${leadId} (stub - not implemented)`);
      // TODO: Implement when FUB provides activity API
      // For now, return empty array to prevent crashes
      return [];
    } catch (error) {
      console.error('Error getting activities:', error);
      return [];
    }
  }

  /**
   * Get property views for a lead
   * @param {string} leadId - CRM lead ID
   * @param {object} options - Query options
   * @returns {array} Property views array
   */
  async getPropertyViews(leadId, options = {}) {
    try {
      console.log(`🏠 Getting property views for lead ${leadId} (stub - not implemented)`);
      // TODO: Implement when FUB provides property view API
      // For now, return empty array to prevent crashes
      return [];
    } catch (error) {
      console.error('Error getting property views:', error);
      return [];
    }
  }

  /**
   * Get custom fields for a lead
   * @param {string} leadId - CRM lead ID
   * @returns {object} Custom fields object
   */
  async getCustomFields(leadId) {
    try {
      console.log(`🔧 Getting custom fields for lead ${leadId}`);
      
      // Get the lead with all fields
      const response = await axios.get(`${this.baseUrl}/people/${leadId}`, {
        headers: this.getHeaders()
      });
      
      const lead = response.data;
      
      // Extract custom fields (fields starting with 'custom')
      const customFields = {};
      for (const [key, value] of Object.entries(lead)) {
        if (key.startsWith('custom')) {
          customFields[key] = value;
        }
      }
      
      return customFields;
    } catch (error) {
      console.error('Error getting custom fields:', error);
      return {};
    }
  }

  /**
   * Get lead score (not available in FUB)
   * @param {string} leadId - CRM lead ID
   * @returns {number} Lead score
   */
  async getLeadScore(leadId) {
    try {
      console.log(`📊 Getting lead score for ${leadId} (stub - not implemented)`);
      // FUB doesn't have built-in lead scoring
      // Would need to calculate based on activity or use custom field
      return null;
    } catch (error) {
      console.error('Error getting lead score:', error);
      return null;
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