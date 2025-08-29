/**
 * Tenant Phone Service
 * Manages phone number to tenant mapping for proper multi-tenant routing
 * Critical for ensuring messages go to the correct tenant
 */

const { supabase } = require('../config/supabase');

class OrganizationPhoneService {
  constructor() {
    // Cache phone-to-tenant mappings for performance
    this.phoneCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get tenant ID from Twilio phone number
   * This is THE critical routing function for multi-tenancy
   */
  async getTenantFromPhone(twilioPhoneNumber) {
    if (!twilioPhoneNumber) {
      throw new Error('Phone number is required for tenant lookup');
    }

    // Normalize the phone number
    const normalizedPhone = this.normalizePhone(twilioPhoneNumber);
    
    // Check cache first
    const cached = this.phoneCache.get(normalizedPhone);
    if (cached && cached.expires > Date.now()) {
      console.log(`📱 Cache hit: ${normalizedPhone} → Organization ${cached.organizationId}`);
      return cached.organizationId;
    }

    try {
      // Query organizations table for phone-to-org mapping using ai_phone_number
      // Use limit(1) instead of single() since multiple orgs might have same phone temporarily
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('ai_phone_number', normalizedPhone)
        .limit(1);

      if (error || !data || data.length === 0) {
        // Try without normalization in case it's stored differently
        const { data: data2 } = await supabase
          .from('organizations')
          .select('id')
          .eq('ai_phone_number', twilioPhoneNumber)
          .limit(1);
          
        if (data2 && data2.length > 0) {
          // Cache the result
          this.phoneCache.set(normalizedPhone, {
            organizationId: data2[0].id,
            expires: Date.now() + this.cacheTimeout
          });
          console.log(`✅ Found organization ${data2[0].id} for phone ${twilioPhoneNumber}`);
          return data2[0].id;
        }
        
        console.error(`❌ No organization found for phone ${normalizedPhone}`);
        return null;
      }

      // Cache the result (use first org if multiple have same phone)
      const orgId = data[0].id;
      this.phoneCache.set(normalizedPhone, {
        organizationId: orgId,
        expires: Date.now() + this.cacheTimeout
      });

      console.log(`✅ Found organization ${orgId} for phone ${normalizedPhone}`);
      return orgId;

    } catch (error) {
      console.error('Error looking up organization by phone:', error);
      return null;
    }
  }

  /**
   * Get tenant's primary phone number for outbound messages
   */
  async getTenantPrimaryPhone(organizationId) {
    try {
      // Get phone number from organizations table
      const { data, error } = await supabase
        .from('organizations')
        .select('ai_phone_number')
        .eq('id', organizationId)
        .single();

      if (error || !data || !data.ai_phone_number) {
        throw new Error(`No AI phone number found for organization ${organizationId}`);
      }

      return data.ai_phone_number;

    } catch (error) {
      console.error('Error getting organization AI phone:', error);
      throw error;
    }
  }

  /**
   * Assign a phone number to a tenant
   */
  async assignPhoneToTenant(phoneNumber, organizationId, options = {}) {
    const {
      isPrimary = false,
      twilioSid = null,
      capabilities = { sms: true, mms: true, voice: false }
    } = options;

    try {
      // Check if phone is already assigned
      const { data: existing } = await supabase
        .from('phone_numbers')
        .select('organization_id')
        .eq('phone_number', this.normalizePhone(phoneNumber))
        .single();

      if (existing && existing.organization_id !== organizationId) {
        throw new Error(`Phone ${phoneNumber} is already assigned to another tenant`);
      }

      // If setting as primary, unset other primary numbers
      if (isPrimary) {
        await supabase
          .from('phone_numbers')
          .update({ is_primary: false })
          .eq('organization_id', organizationId);
      }

      // Insert or update phone assignment
      const normalizedPhone = this.normalizePhone(phoneNumber);
      
      // If phone exists for this tenant, update it; otherwise insert
      if (existing && existing.organization_id === organizationId) {
        // Update existing assignment
        const { data, error } = await supabase
          .from('phone_numbers')
          .update({
            is_primary: isPrimary,
            provider_sid: twilioSid,
            capabilities: capabilities,
            is_active: true,
            updated_at: new Date()
          })
          .eq('phone_number', normalizedPhone)
          .eq('organization_id', organizationId)
          .select()
          .single();
        
        if (error) throw error;
        
        // Clear cache for this phone
        this.phoneCache.delete(normalizedPhone);
        
        console.log(`✅ Updated phone ${phoneNumber} for tenant ${organizationId}`);
        return data;
      } else {
        // Insert new assignment
        const { data, error } = await supabase
          .from('phone_numbers')
          .insert({
            phone_number: normalizedPhone,
            organization_id: organizationId,
            is_primary: isPrimary,
            provider_sid: twilioSid,
            capabilities: capabilities,
            is_active: true,
            purchased_at: new Date()
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Clear cache for this phone
        this.phoneCache.delete(normalizedPhone);
        
        console.log(`✅ Phone ${phoneNumber} assigned to tenant ${organizationId}`);
        return data;
      }

    } catch (error) {
      console.error('Error assigning phone to tenant:', error);
      throw error;
    }
  }

  /**
   * Get all phone numbers for a tenant
   */
  async getTenantPhones(organizationId) {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('organization_id', organizationId)
        .order('is_primary', { ascending: false });

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Error getting tenant phones:', error);
      return [];
    }
  }

  /**
   * Release a phone number from a tenant
   */
  async releasePhone(phoneNumber, organizationId) {
    try {
      // Delete the phone assignment completely
      const { error } = await supabase
        .from('phone_numbers')
        .delete()
        .eq('phone_number', this.normalizePhone(phoneNumber))
        .eq('organization_id', organizationId);

      if (error) throw error;

      // Clear cache
      this.phoneCache.delete(this.normalizePhone(phoneNumber));

      console.log(`📱 Released phone ${phoneNumber} from tenant ${organizationId}`);
      return true;

    } catch (error) {
      console.error('Error releasing phone:', error);
      return false;
    }
  }

  /**
   * Validate that a tenant owns a specific phone number
   */
  async validateTenantOwnsPhone(organizationId, phoneNumber) {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number', this.normalizePhone(phoneNumber))
        .eq('is_active', true)
        .single();

      return !error && data !== null;

    } catch (error) {
      console.error('Error validating phone ownership:', error);
      return false;
    }
  }

  /**
   * Normalize phone number for consistent storage/lookup
   */
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle US numbers
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Add + prefix
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache() {
    this.phoneCache.clear();
    console.log('📱 Phone cache cleared');
  }
}

// Create singleton instance
const instance = new OrganizationPhoneService();

// Add static method for webhook usage
OrganizationPhoneService.getTenantFromPhone = async function(phoneNumber) {
  return instance.getTenantFromPhone(phoneNumber);
};

OrganizationPhoneService.getTenantPrimaryPhone = async function(organizationId) {
  return instance.getTenantPrimaryPhone(organizationId);
};

// Export as singleton
module.exports = instance;