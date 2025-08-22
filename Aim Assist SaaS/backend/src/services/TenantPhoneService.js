/**
 * Tenant Phone Service
 * Manages phone number to tenant mapping for proper multi-tenant routing
 * Critical for ensuring messages go to the correct tenant
 */

const { supabase } = require('../config/supabase');

class TenantPhoneService {
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
      console.log(`📱 Cache hit: ${normalizedPhone} → Tenant ${cached.tenantId}`);
      return cached.tenantId;
    }

    try {
      // Query database for phone-to-tenant mapping
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('tenant_id, is_active')
        .eq('phone_number', normalizedPhone)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.error(`❌ No active tenant found for phone ${normalizedPhone}`);
        return null;
      }

      // Cache the result
      this.phoneCache.set(normalizedPhone, {
        tenantId: data.tenant_id,
        expires: Date.now() + this.cacheTimeout
      });

      console.log(`✅ Found tenant ${data.tenant_id} for phone ${normalizedPhone}`);
      return data.tenant_id;

    } catch (error) {
      console.error('Error looking up tenant by phone:', error);
      return null;
    }
  }

  /**
   * Get tenant's primary phone number for outbound messages
   */
  async getTenantPrimaryPhone(tenantId) {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('phone_number, capabilities')
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        // Fallback to any active SMS-capable number
        const { data: fallback } = await supabase
          .from('phone_numbers')
          .select('phone_number, capabilities')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .not('capabilities->sms', 'is', false)
          .limit(1)
          .single();

        if (fallback) {
          console.log(`📱 Using fallback phone for tenant ${tenantId}: ${fallback.phone_number}`);
          return fallback.phone_number;
        }

        throw new Error(`No active phone numbers found for tenant ${tenantId}`);
      }

      return data.phone_number;

    } catch (error) {
      console.error('Error getting tenant primary phone:', error);
      throw error;
    }
  }

  /**
   * Assign a phone number to a tenant
   */
  async assignPhoneToTenant(phoneNumber, tenantId, options = {}) {
    const {
      isPrimary = false,
      twilioSid = null,
      capabilities = { sms: true, mms: true, voice: false }
    } = options;

    try {
      // Check if phone is already assigned
      const { data: existing } = await supabase
        .from('phone_numbers')
        .select('tenant_id')
        .eq('phone_number', phoneNumber)
        .single();

      if (existing && existing.tenant_id !== tenantId) {
        throw new Error(`Phone ${phoneNumber} is already assigned to another tenant`);
      }

      // If setting as primary, unset other primary numbers
      if (isPrimary) {
        await supabase
          .from('phone_numbers')
          .update({ is_primary: false })
          .eq('tenant_id', tenantId);
      }

      // Insert or update phone assignment
      const { data, error } = await supabase
        .from('phone_numbers')
        .upsert({
          phone_number: this.normalizePhone(phoneNumber),
          tenant_id: tenantId,
          is_primary: isPrimary,
          provider_sid: twilioSid,  // Changed from twilio_sid
          capabilities: capabilities,
          is_active: true,
          purchased_at: new Date()
        }, {
          onConflict: 'phone_number'
        })
        .select()
        .single();

      if (error) throw error;

      // Clear cache for this phone
      this.phoneCache.delete(this.normalizePhone(phoneNumber));

      console.log(`✅ Phone ${phoneNumber} assigned to tenant ${tenantId}`);
      return data;

    } catch (error) {
      console.error('Error assigning phone to tenant:', error);
      throw error;
    }
  }

  /**
   * Get all phone numbers for a tenant
   */
  async getTenantPhones(tenantId) {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('tenant_id', tenantId)
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
  async releasePhone(phoneNumber, tenantId) {
    try {
      const { error } = await supabase
        .from('phone_numbers')
        .update({
          is_active: false,
          released_at: new Date()
        })
        .eq('phone_number', phoneNumber)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      // Clear cache
      this.phoneCache.delete(this.normalizePhone(phoneNumber));

      console.log(`📱 Released phone ${phoneNumber} from tenant ${tenantId}`);
      return true;

    } catch (error) {
      console.error('Error releasing phone:', error);
      return false;
    }
  }

  /**
   * Validate that a tenant owns a specific phone number
   */
  async validateTenantOwnsPhone(tenantId, phoneNumber) {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('tenant_id', tenantId)
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

// Export as singleton
module.exports = new TenantPhoneService();