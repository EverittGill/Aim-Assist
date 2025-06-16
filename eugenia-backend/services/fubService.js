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

  async fetchLeads(limit = 500, offset = 0) {
    const fieldsToRequest = "id,name,firstName,lastName,stage,source,created,updated,lastCommunication,customFields,background,tags,emails,phones";
    const url = `${this.baseUrl}/people?limit=${limit}&offset=${offset}&sort=-created&fields=${fieldsToRequest}`;

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
          conversationHistory: []
        };
      });

      return processedLeads;
    } catch (error) {
      console.error('Error fetching leads from FUB:', error);
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
      userId: this.userId ? parseInt(this.userId) : undefined
    };
    
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
      const updates = {
        customFields: {
          [fieldName]: value
        }
      };
      
      return await this.updateLead(leadId, updates);
    } catch (error) {
      console.error('Error updating custom field in FUB:', error);
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