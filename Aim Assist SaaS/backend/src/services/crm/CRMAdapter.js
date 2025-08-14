/**
 * Abstract base class for all CRM integrations
 * Defines standard interface that all CRMs must implement
 * Includes utility methods for phone normalization, field mapping
 */

class CRMAdapter {
  constructor(tenantId, config = {}) {
    this.tenantId = tenantId;
    this.config = config;
    this.credentials = config.credentials || {};
    this.fieldMappings = config.fieldMappings || this.getDefaultFieldMappings();
    
    // Ensure child class implements required methods
    if (this.constructor === CRMAdapter) {
      throw new Error('CRMAdapter is an abstract class and cannot be instantiated directly');
    }
  }

  /**
   * Default field mappings - can be overridden by CRM-specific adapters
   */
  getDefaultFieldMappings() {
    return {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      source: 'source',
      tags: 'tags',
      created_at: 'created',
      updated_at: 'updated'
    };
  }

  /**
   * Normalize phone number to E.164 format
   * @param {string} phone - Phone number in any format
   * @returns {string} - Phone in E.164 format (+1XXXXXXXXXX)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle US numbers (assume US if 10 digits)
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Add + prefix if not present
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    // Return original if can't normalize
    return phone;
  }

  /**
   * Map CRM fields to standard Aim Assist schema
   * @param {Object} crmData - Raw data from CRM
   * @returns {Object} - Standardized lead object
   */
  mapToStandardSchema(crmData) {
    const standardLead = {
      crm_lead_id: null,
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      source: null,
      tags: [],
      stage: null,
      assigned_to: null,
      crm_data: crmData // Store original for reference
    };

    // Map fields using configured mappings
    for (const [standardField, crmField] of Object.entries(this.fieldMappings)) {
      if (crmData[crmField] !== undefined) {
        if (standardField === 'phone') {
          standardLead[standardField] = this.normalizePhone(crmData[crmField]);
        } else if (standardField === 'tags') {
          // Ensure tags is always an array
          const tags = crmData[crmField];
          standardLead[standardField] = Array.isArray(tags) ? tags : 
                                        (tags ? [tags] : []);
        } else {
          standardLead[standardField] = crmData[crmField];
        }
      }
    }

    return standardLead;
  }

  /**
   * Map standard schema back to CRM format
   * @param {Object} standardData - Standard Aim Assist lead data
   * @returns {Object} - CRM-specific format
   */
  mapToCRMSchema(standardData) {
    const crmData = {};
    
    // Reverse mapping
    for (const [standardField, crmField] of Object.entries(this.fieldMappings)) {
      if (standardData[standardField] !== undefined) {
        crmData[crmField] = standardData[standardField];
      }
    }
    
    return crmData;
  }

  /**
   * Test CRM connection with provided credentials
   * @returns {Promise<boolean>} - True if connection successful
   */
  async testConnection() {
    throw new Error('testConnection must be implemented by CRM adapter');
  }

  /**
   * Get all leads from CRM
   * @param {Object} options - Query options (limit, offset, filters)
   * @returns {Promise<Array>} - Array of standardized lead objects
   */
  async getLeads(options = {}) {
    throw new Error('getLeads must be implemented by CRM adapter');
  }

  /**
   * Get single lead by CRM ID
   * @param {string} leadId - CRM-specific lead ID
   * @returns {Promise<Object>} - Standardized lead object
   */
  async getLead(leadId) {
    throw new Error('getLead must be implemented by CRM adapter');
  }

  /**
   * Create new lead in CRM
   * @param {Object} leadData - Standard lead data
   * @returns {Promise<Object>} - Created lead with CRM ID
   */
  async createLead(leadData) {
    throw new Error('createLead must be implemented by CRM adapter');
  }

  /**
   * Update existing lead in CRM
   * @param {string} leadId - CRM-specific lead ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated lead
   */
  async updateLead(leadId, updates) {
    throw new Error('updateLead must be implemented by CRM adapter');
  }

  /**
   * Delete lead from CRM
   * @param {string} leadId - CRM-specific lead ID
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deleteLead(leadId) {
    throw new Error('deleteLead must be implemented by CRM adapter');
  }

  /**
   * Search leads by phone number
   * @param {string} phone - Phone number to search
   * @returns {Promise<Object|null>} - Lead if found, null otherwise
   */
  async findLeadByPhone(phone) {
    const normalizedPhone = this.normalizePhone(phone);
    const leads = await this.getLeads({ 
      filters: { phone: normalizedPhone } 
    });
    return leads.length > 0 ? leads[0] : null;
  }

  /**
   * Log SMS message to CRM
   * @param {string} leadId - CRM-specific lead ID
   * @param {Object} message - Message details
   * @returns {Promise<boolean>} - True if logged successfully
   */
  async logMessage(leadId, message) {
    throw new Error('logMessage must be implemented by CRM adapter');
  }

  /**
   * Get conversation history for lead
   * @param {string} leadId - CRM-specific lead ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of messages
   */
  async getConversationHistory(leadId, options = {}) {
    throw new Error('getConversationHistory must be implemented by CRM adapter');
  }

  /**
   * Update custom fields in CRM
   * @param {string} leadId - CRM-specific lead ID
   * @param {Object} customFields - Custom field values
   * @returns {Promise<boolean>} - True if updated successfully
   */
  async updateCustomFields(leadId, customFields) {
    throw new Error('updateCustomFields must be implemented by CRM adapter');
  }

  /**
   * Subscribe to CRM webhooks
   * @param {Object} webhookConfig - Webhook configuration
   * @returns {Promise<Object>} - Webhook subscription details
   */
  async subscribeToWebhooks(webhookConfig) {
    // Optional - not all CRMs support webhooks
    console.warn(`${this.constructor.name} does not support webhooks`);
    return null;
  }

  /**
   * Handle incoming webhook from CRM
   * @param {Object} webhookData - Raw webhook payload
   * @returns {Object} - Processed event data
   */
  processWebhook(webhookData) {
    // Optional - implement if CRM supports webhooks
    console.warn(`${this.constructor.name} does not support webhooks`);
    return null;
  }

  /**
   * Get CRM-specific metadata
   * @returns {Object} - Adapter metadata
   */
  getMetadata() {
    return {
      adapter: this.constructor.name,
      version: '1.0.0',
      capabilities: {
        webhooks: false,
        customFields: false,
        bulkOperations: false,
        conversationHistory: false
      }
    };
  }
}

module.exports = CRMAdapter;