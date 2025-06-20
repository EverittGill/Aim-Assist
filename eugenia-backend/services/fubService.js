class FUBService {
  constructor(apiKey, xSystem, xSystemKey, userId) {
    if (!apiKey || !xSystem || !xSystemKey) {
      throw new Error('FUB API key, X-System, and X-System-Key are required');
    }
    this.apiKey = apiKey;
    this.xSystem = xSystem;
    this.xSystemKey = xSystemKey;
    this.userId = userId;
    this.baseUrl = 'https://api.followupboss.com/v1';
    this.basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
  }

  getHeaders() {
    return {
      'Authorization': `Basic ${this.basicAuth}`,
      'X-System': this.xSystem,
      'X-System-Key': this.xSystemKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  isValidPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return false;
    
    // Remove any non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // Check for E.164 format (starts with + and has 10-15 digits)
    const e164Regex = /^\+[1-9]\d{9,14}$/;
    
    // Also accept 10-digit US numbers
    const usPhoneRegex = /^\d{10}$/;
    
    // Accept 11-digit US numbers starting with 1
    const us11DigitRegex = /^1\d{10}$/;
    
    return e164Regex.test(cleanPhone) || usPhoneRegex.test(cleanPhone) || us11DigitRegex.test(cleanPhone);
  }

  normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.length === 10) {
      // US number without country code
      cleaned = '1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // US number with country code
      // Already in correct format
    } else if (cleaned.length > 11) {
      // International or invalid - try to use as is
      return '+' + cleaned;
    } else {
      // Invalid length
      return null;
    }
    
    // Return in E.164 format
    return '+' + cleaned;
  }

  async findLeadByPhone(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Normalize the phone number
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      console.error('Invalid phone number format:', phoneNumber);
      return null;
    }

    // Try different phone formats for searching
    const phoneVariants = [
      normalizedPhone,                                    // +17068184445
      normalizedPhone.substring(2),                       // 7068184445  
      normalizedPhone.substring(1),                       // 17068184445
      phoneNumber                                         // Original format
    ];

    console.log('Searching for lead with phone variants:', phoneVariants);

    for (const phoneVariant of phoneVariants) {
      try {
        // Search for leads with this phone number
        const url = `${this.baseUrl}/people?limit=10&q=${encodeURIComponent(phoneVariant)}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (!response.ok) {
          console.error('FUB search failed:', response.status);
          continue;
        }

        const data = await response.json();
        
        // Look through results for exact phone match
        for (const person of data.people || []) {
          const phones = person.phones || [];
          
          for (const phone of phones) {
            const leadPhoneNormalized = this.normalizePhoneNumber(phone.value);
            
            if (leadPhoneNormalized === normalizedPhone) {
              console.log(`Found lead match: ${person.name} (ID: ${person.id})`);
              
              // Return full lead data in expected format
              return {
                id: person.id.toString(),
                name: person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
                email: person.emails?.find(e => e.isPrimary)?.value || person.emails?.[0]?.value || null,
                phone: phone.value,
                hasValidPhone: true,
                status: person.stage || 'Unknown',
                fubLink: `https://app.followupboss.com/people/${person.id}`,
                lastContacted: person.lastCommunication?.createdDate || person.updated,
                notes: person.customFields?.find(cf => cf.name.toLowerCase() === 'notes')?.value || person.background || '',
                source: person.source || 'Unknown',
                tags: person.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
                customFields: person.customFields || [],
                ylopoStarsLink: person.sourceUrl && person.sourceUrl.includes('stars.ylopo.com') ? person.sourceUrl : null
              };
            }
          }
        }
      } catch (error) {
        console.error('Error searching with phone variant:', phoneVariant, error);
        continue;
      }
    }

    console.log('No lead found for phone number:', phoneNumber);
    return null;
  }

  async fetchLeads(limit = 500, offset = 0) {
    // Try without specifying fields to get all available data
    const url = `${this.baseUrl}/people?limit=${limit}&offset=${offset}&sort=-created`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FUB API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Transform to expected format with phone validation
      const processedLeads = data.people.map(p => {
        const phone = p.phones?.find(ph => ph.isPrimary)?.value || p.phones?.[0]?.value || null;
        const hasValidPhone = this.isValidPhoneNumber(phone);
        
        // Log custom fields for debugging
        if (p.customFields && p.customFields.length > 0) {
          console.log(`Lead ${p.name} has custom fields:`, p.customFields.map(cf => ({ name: cf.name, value: cf.value })));
        }
        
        return {
          id: p.id.toString(),
          name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          email: p.emails?.find(e => e.isPrimary)?.value || p.emails?.[0]?.value || null,
          phone: phone,
          hasValidPhone: hasValidPhone,
          status: p.stage || 'Unknown',
          fubLink: `https://app.followupboss.com/people/${p.id}`,
          lastContacted: p.lastCommunication?.createdDate || p.updated,
          notes: p.customFields?.find(cf => cf.name.toLowerCase() === 'notes')?.value || p.background || '',
          source: p.source || 'Unknown',
          tags: p.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
          customFields: p.customFields || [],
          ylopoStarsLink: p.sourceUrl && p.sourceUrl.includes('stars.ylopo.com') ? p.sourceUrl : null,
          conversationHistory: []
        };
      });

      return processedLeads;
    } catch (error) {
      console.error('Error fetching leads from FUB:', error);
      throw error;
    }
  }

  async getLeadById(leadId) {
    // Add fields=allFields to ensure we get all fields including background
    const url = `${this.baseUrl}/people/${leadId}?fields=allFields`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FUB API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching lead from FUB:', error);
      throw error;
    }
  }

  async logTextMessage(leadId, message, direction = 'outbound', fromNumber = null, toNumber = null) {
    const url = `${this.baseUrl}/textMessages`;
    
    // Get lead's phone number if toNumber not provided
    let finalToNumber = toNumber;
    let finalFromNumber = fromNumber;
    
    if (!finalToNumber || !this.isValidPhoneNumber(finalToNumber)) {
      // Fetch lead's phone number from FUB
      try {
        const leadUrl = `${this.baseUrl}/people/${leadId}`;
        const leadResponse = await fetch(leadUrl, {
          method: 'GET',
          headers: this.getHeaders()
        });
        
        if (leadResponse.ok) {
          const leadData = await leadResponse.json();
          const leadPhone = leadData.phones?.find(ph => ph.isPrimary)?.value || leadData.phones?.[0]?.value;
          
          if (leadPhone && this.isValidPhoneNumber(leadPhone)) {
            if (direction === 'inbound') {
              finalFromNumber = leadPhone;
              finalToNumber = process.env.TWILIO_FROM_NUMBER || '+15551234567';
            } else {
              finalFromNumber = process.env.TWILIO_FROM_NUMBER || '+15551234567';
              finalToNumber = leadPhone;
            }
          }
        }
      } catch (error) {
        console.warn('Could not fetch lead phone number:', error.message);
      }
    }
    
    const payload = {
      personId: parseInt(leadId),
      message: message,
      isIncoming: direction === 'inbound'  // Set based on direction
    };
    
    // Only add userId for outbound messages if it's a valid numeric ID
    if (direction === 'outbound' && this.userId && !isNaN(parseInt(this.userId))) {
      payload.userId = parseInt(this.userId);
    }
    
    // Add phone numbers if valid
    if (finalFromNumber && this.isValidPhoneNumber(finalFromNumber)) {
      payload.fromNumber = finalFromNumber;
    }
    if (finalToNumber && this.isValidPhoneNumber(finalToNumber)) {
      payload.toNumber = finalToNumber;
    }
    
    // FUB requires at least toNumber for SMS logging
    if (!payload.toNumber) {
      console.warn(`Skipping FUB SMS logging for lead ${leadId} - no valid toNumber available`);
      return { id: 'skipped', reason: 'No valid phone number' };
    }

    // Remove undefined fields
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    try {
      console.log(`Logging ${direction} SMS to FUB for lead ${leadId}:`, message);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to log text message to FUB (${response.status}):`, errorText);
        throw new Error(`FUB SMS logging failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('Successfully logged SMS to FUB:', result.id);
      return result;
    } catch (error) {
      console.error('Error logging text message to FUB:', error);
      throw error;
    }
  }

  async updateLead(leadId, updates) {
    const url = `${this.baseUrl}/people/${leadId}`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FUB Update Error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating lead in FUB:', error);
      throw error;
    }
  }

  async updateLeadCustomField(leadId, fieldName, value) {
    try {
      // Custom fields go at the root level, not nested
      const updates = {
        [fieldName]: value
      };
      
      return await this.updateLead(leadId, updates);
    } catch (error) {
      console.error('Error updating custom field in FUB:', error);
      throw error;
    }
  }

  /**
   * Update lead notes field with message storage
   * @param {string} leadId - FUB lead ID
   * @param {Object} messageStorage - Message storage object
   * @param {string} existingNotes - Existing notes to preserve
   * @returns {Object} Updated lead data
   */
  async updateLeadNotes(leadId, messageStorage, existingNotes = '') {
    try {
      const messageStorageService = require('./messageStorageService');
      const formattedNotes = messageStorageService.formatForNotes(messageStorage, existingNotes);
      
      // Update the background field which is FUB's notes field
      const updates = {
        background: formattedNotes
      };
      
      console.log(`Updating notes for lead ${leadId}, size: ${formattedNotes.length} chars`);
      console.log(`First 200 chars of notes: ${formattedNotes.substring(0, 200)}`);
      const result = await this.updateLead(leadId, updates);
      console.log(`Update response:`, result ? 'Success' : 'Failed');
      return result;
    } catch (error) {
      console.error('Error updating lead notes in FUB:', error);
      throw error;
    }
  }

  /**
   * Get lead notes containing message storage
   * @param {string} leadId - FUB lead ID
   * @returns {Object} Parsed message storage
   */
  async getLeadMessageStorage(leadId) {
    try {
      const lead = await this.getLeadById(leadId);
      const messageStorageService = require('./messageStorageService');
      
      // FUB stores notes in the 'background' field
      const notes = lead.background || '';
      console.log(`Raw notes from FUB (first 200 chars): ${notes.substring(0, 200)}`);
      const parsed = messageStorageService.parseMessagesFromNotes(notes);
      console.log(`Parsed ${parsed.conversations?.length || 0} messages from notes`);
      return parsed;
    } catch (error) {
      console.error('Error getting lead message storage:', error);
      throw error;
    }
  }

  /**
   * Add a message to lead's stored conversations
   * @param {string} leadId - FUB lead ID
   * @param {Object} message - Message to add
   * @returns {Object} Updated lead data
   */
  async addMessageToLeadStorage(leadId, message) {
    try {
      const messageStorageService = require('./messageStorageService');
      
      // Get current lead data
      const lead = await this.getLeadById(leadId);
      const existingNotes = lead.background || '';
      
      // Parse existing messages
      let storage = messageStorageService.parseMessagesFromNotes(existingNotes);
      
      // Add new message
      storage = messageStorageService.addMessage(storage, message);
      
      // Check if approaching storage limit
      if (messageStorageService.isApproachingLimit(storage)) {
        console.warn(`Lead ${leadId} approaching message storage limit`);
      }
      
      // Update lead notes
      return await this.updateLeadNotes(leadId, storage, existingNotes);
    } catch (error) {
      console.error('Error adding message to lead storage:', error);
      throw error;
    }
  }

  async updateLeadStatus(leadId, status) {
    try {
      const updates = { stage: status };
      return await this.updateLead(leadId, updates);
    } catch (error) {
      console.error('Error updating lead status in FUB:', error);
      throw error;
    }
  }

  async createLead(leadData) {
    const url = `${this.baseUrl}/people`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(leadData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FUB Create Error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating lead in FUB:', error);
      throw error;
    }
  }

  async deleteLead(leadId) {
    const url = `${this.baseUrl}/people/${leadId}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FUB Delete Error (${response.status}): ${errorText}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting lead from FUB:', error);
      throw error;
    }
  }
}

module.exports = FUBService;