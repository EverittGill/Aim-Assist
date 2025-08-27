/**
 * TranslationService - Centralized CRM ↔ Supabase field mapping
 * 
 * Handles bidirectional translation between CRM APIs and Supabase schema
 * Supports multiple CRM types with configurable field mappings
 * Ensures consistent data structure across the multi-tenant platform
 */

class TranslationService {
  constructor(crmType) {
    this.crmType = crmType?.toLowerCase() || 'fub';
    this.mappings = this.getFieldMappings(this.crmType);
  }

  /**
   * Get field mappings for specific CRM type
   */
  getFieldMappings(crmType) {
    const mappings = {
      fub: {
        // FUB API fields → Supabase database columns
        toSupabase: {
          // Basic fields
          'id': 'fub_lead_id',
          'firstName': 'first_name', 
          'lastName': 'last_name',
          'name': 'full_name',
          
          // Contact fields
          'emails': 'email', // Will extract primary
          'phones': 'phone', // Will extract primary
          
          // Source & tracking
          'source': 'source',
          'sourceUrl': 'source_url',
          'sourceId': 'source_id',
          
          // Status & assignment
          'stage': 'stage',
          'stageId': 'stage_id',
          'assignedUserId': 'assigned_agent_id',
          'assignedTo': 'assigned_agent_name',
          
          // Tags
          'tags': 'tags',
          
          // Timestamps
          'created': 'crm_created_at',
          'updated': 'crm_updated_at',
          'lastActivity': 'last_activity_at',
          
          // Deal info
          'dealStatus': 'deal_status',
          'dealStage': 'deal_stage',
          'dealPrice': 'deal_price',
          'dealCloseDate': 'deal_close_date',
          
          // Additional fields
          'contacted': 'contacted_count',
          'delayed': 'is_delayed',
          'claimed': 'is_claimed',
          'price': 'price_range'
        },
        
        // Supabase database columns → FUB API fields
        fromSupabase: {
          'fub_lead_id': 'id',
          'first_name': 'firstName',
          'last_name': 'lastName',
          'email': 'emails', // Will format as array
          'phone': 'phones', // Will format as array
          'source': 'source',
          'stage': 'stage',
          'tags': 'tags',
          'assigned_agent_id': 'assignedUserId'
        },
        
        // Complex field extractors
        extractors: {
          email: (fubData) => {
            const emails = fubData.emails || [];
            return emails.find(e => e.isPrimary)?.value || emails[0]?.value || null;
          },
          phone: (fubData) => {
            const phones = fubData.phones || [];
            const primary = phones.find(p => p.isPrimary)?.value || phones[0]?.value || null;
            return primary ? this.normalizePhone(primary) : null;
          },
          tags: (fubData) => {
            const tags = fubData.tags || [];
            return tags.map(tag => typeof tag === 'string' ? tag : tag.name);
          }
        },
        
        // Complex field formatters (for sending to FUB)
        formatters: {
          emails: (email) => {
            if (!email) return [];
            return [{ value: email, isPrimary: true }];
          },
          phones: (phone) => {
            if (!phone) return [];
            return [{ value: phone, isPrimary: true }];
          },
          tags: (tags) => {
            if (!tags || !Array.isArray(tags)) return [];
            return tags;
          }
        }
      },
      
      lofty: {
        // Lofty/Chime mappings (placeholder - to be implemented)
        toSupabase: {
          'id': 'lofty_lead_id',
          'first_name': 'first_name',
          'last_name': 'last_name',
          'email': 'email',
          'phone': 'phone',
          'source': 'source',
          'tags': 'tags',
          'created_at': 'crm_created_at',
          'updated_at': 'crm_updated_at'
        },
        fromSupabase: {
          'lofty_lead_id': 'id',
          'first_name': 'first_name',
          'last_name': 'last_name',
          'email': 'email',
          'phone': 'phone',
          'source': 'source',
          'tags': 'tags'
        },
        extractors: {},
        formatters: {}
      }
    };
    
    return mappings[crmType] || mappings.fub;
  }

  /**
   * Translate CRM data to Supabase schema
   */
  toSupabase(crmData) {
    if (!crmData) return null;
    
    const result = {};
    const mapping = this.mappings.toSupabase;
    const extractors = this.mappings.extractors || {};
    
    // Map simple fields
    for (const [crmField, dbField] of Object.entries(mapping)) {
      if (crmData[crmField] !== undefined) {
        // Use extractor if available for complex fields
        if (extractors[dbField]) {
          result[dbField] = extractors[dbField].call(this, crmData);
        } else {
          result[dbField] = crmData[crmField];
        }
      }
    }
    
    // Handle complex fields that need extraction
    if (extractors.email && !result.email) {
      result.email = extractors.email.call(this, crmData);
    }
    if (extractors.phone && !result.phone) {
      result.phone = extractors.phone.call(this, crmData);
    }
    if (extractors.tags && !result.tags) {
      result.tags = extractors.tags.call(this, crmData);
    }
    
    // Store original CRM data for reference
    result.crm_data = crmData;
    
    // Ensure CRM-specific ID field is set
    const crmIdField = this.getCRMLeadIdField();
    if (crmData.id && !result[crmIdField]) {
      result[crmIdField] = String(crmData.id);
    }
    
    // Add metadata
    result.last_synced_at = new Date();
    result.sync_status = 'synced';
    
    return result;
  }

  /**
   * Translate Supabase data back to CRM format
   */
  fromSupabase(dbData) {
    if (!dbData) return null;
    
    const result = {};
    const mapping = this.mappings.fromSupabase;
    const formatters = this.mappings.formatters || {};
    
    // Map fields back to CRM format
    for (const [dbField, crmField] of Object.entries(mapping)) {
      if (dbData[dbField] !== undefined && dbData[dbField] !== null) {
        // Use formatter if available for complex fields
        if (formatters[crmField]) {
          result[crmField] = formatters[crmField].call(this, dbData[dbField]);
        } else {
          result[crmField] = dbData[dbField];
        }
      }
    }
    
    return result;
  }

  /**
   * Get the CRM-specific lead ID field name
   */
  getCRMLeadIdField() {
    return `${this.crmType}_lead_id`;
  }
  
  /**
   * Get the CRM lead ID value from a lead object
   * Checks multiple possible locations
   */
  getCRMLeadId(lead) {
    if (!lead) return null;
    
    const crmIdField = this.getCRMLeadIdField();
    
    // Try direct field first
    if (lead[crmIdField]) return lead[crmIdField];
    
    // Try legacy field
    if (lead.crm_lead_id) return lead.crm_lead_id;
    
    // Try generic ID field
    if (lead.id) return lead.id;
    
    return null;
  }

  /**
   * Get the value of the CRM-specific lead ID from database record
   */
  getCRMLeadId(dbData) {
    const field = this.getCRMLeadIdField();
    return dbData[field];
  }

  /**
   * Build query filter for CRM-specific lead ID
   */
  getCRMLeadIdFilter(leadId) {
    const field = this.getCRMLeadIdField();
    return { [field]: String(leadId) };
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Format as E.164
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    // Return original if can't normalize
    return phone;
  }

  /**
   * Extract primary value from CRM array field
   */
  extractPrimary(items, field = 'value') {
    if (!Array.isArray(items) || items.length === 0) return null;
    
    // Look for primary flagged item
    const primary = items.find(item => item.isPrimary);
    if (primary) return primary[field];
    
    // Fall back to first item
    return items[0][field] || null;
  }

  /**
   * Map CRM tags to array of strings
   */
  extractTags(tags) {
    if (!tags) return [];
    if (!Array.isArray(tags)) return [];
    
    return tags.map(tag => {
      if (typeof tag === 'string') return tag;
      if (tag.name) return tag.name;
      if (tag.tag) return tag.tag;
      return String(tag);
    }).filter(Boolean);
  }

  /**
   * Validate required fields for CRM
   */
  validateForCRM(data) {
    const errors = [];
    
    // Check required fields based on CRM type
    if (this.crmType === 'fub') {
      // FUB doesn't strictly require any fields, but these are recommended
      if (!data.firstName && !data.lastName && !data.emails && !data.phones) {
        errors.push('At least one of firstName, lastName, email, or phone is required');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get a summary of the translation mappings (for debugging)
   */
  getMappingSummary() {
    return {
      crmType: this.crmType,
      crmIdField: this.getCRMLeadIdField(),
      toSupabaseFields: Object.keys(this.mappings.toSupabase),
      fromSupabaseFields: Object.keys(this.mappings.fromSupabase),
      hasExtractors: Object.keys(this.mappings.extractors || {}).length > 0,
      hasFormatters: Object.keys(this.mappings.formatters || {}).length > 0
    };
  }
}

module.exports = TranslationService;