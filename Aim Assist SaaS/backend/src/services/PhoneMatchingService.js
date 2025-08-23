/**
 * Phone Matching Service
 * Ensures leads are properly matched between Supabase and CRM by phone number
 * Handles phone number normalization and verification
 */

const { supabase } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');

class PhoneMatchingService {
  constructor(tenantId) {
    this.tenantId = tenantId;
  }

  /**
   * Normalize phone number to E.164 format for consistent matching
   */
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle US numbers
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Remove leading 1 if present for matching
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = cleaned.substring(1);
    }
    
    return cleaned; // Return 10-digit format for matching
  }

  /**
   * Find or create lead by phone number
   * This is the MAIN entry point for all incoming messages
   * CRITICAL: Must be tenant-aware to prevent cross-tenant data access
   */
  async findOrCreateLeadByPhone(phoneNumber) {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    
    if (!normalizedPhone) {
      throw new Error('Invalid phone number provided');
    }
    
    console.log(`📱 [Tenant ${this.tenantId}] Finding lead with phone: ${normalizedPhone} (original: ${phoneNumber})`);
    
    try {
      // Step 1: Check Supabase first - MUST filter by tenant_id
      const { data: supabaseLead, error: dbError } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', this.tenantId)  // CRITICAL: Tenant isolation
        .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)
        .single();
      
      if (supabaseLead && !dbError) {
        console.log(`✅ Found lead in Supabase: ${supabaseLead.crm_lead_id} - ${supabaseLead.full_name || 'No name'}`);
        return {
          lead: supabaseLead,
          source: 'supabase',
          needsSync: true // Always sync to get latest from CRM
        };
      }
      
      // Step 2: Search in CRM
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      const crmLead = await adapter.findLeadByPhone(phoneNumber);
      
      if (crmLead) {
        console.log(`✅ Found lead in CRM: ${crmLead.crm_lead_id} - ${crmLead.first_name} ${crmLead.last_name}`);
        
        // Check if lead should sync based on tags
        const TenantService = require('./TenantService');
        const shouldSync = await TenantService.shouldSyncLead(this.tenantId, crmLead.tags || []);
        
        if (shouldSync) {
          // Step 3: Sync CRM lead to Supabase
          const syncedLead = await this.syncLeadToSupabase(crmLead);
          
          return {
            lead: syncedLead,
            source: 'crm',
            needsSync: false
          };
        } else {
          console.log(`⏭️ Lead doesn't have required tags for sync. Tags: ${(crmLead.tags || []).join(', ')}`);
          // Return CRM lead without syncing
          return {
            lead: {
              crm_lead_id: crmLead.crm_lead_id || crmLead.id,
              first_name: crmLead.first_name,
              last_name: crmLead.last_name,
              phone: crmLead.phone,
              tags: crmLead.tags,
              tenant_id: this.tenantId
            },
            source: 'crm_no_sync',
            needsSync: false
          };
        }
      }
      
      // Step 4: Lead doesn't exist - create new one
      console.log(`📝 Creating new lead for phone: ${phoneNumber}`);
      
      const newCrmLead = await adapter.createLead({
        phone: phoneNumber,
        source: 'sms_inbound',
        tags: ['sms_lead', 'auto_created'],
        notes: `Lead created from incoming SMS: ${phoneNumber}`
      });
      
      if (!newCrmLead || !newCrmLead.crm_lead_id) {
        throw new Error('Failed to create lead in CRM');
      }
      
      // Sync to Supabase
      const syncedNewLead = await this.syncLeadToSupabase(newCrmLead);
      
      return {
        lead: syncedNewLead,
        source: 'created',
        needsSync: false
      };
      
    } catch (error) {
      console.error('Error in findOrCreateLeadByPhone:', error);
      throw error;
    }
  }

  /**
   * Sync lead from CRM to Supabase
   */
  async syncLeadToSupabase(crmLead) {
    try {
      const leadData = {
        tenant_id: this.tenantId,
        crm_lead_id: crmLead.crm_lead_id || crmLead.id,
        crm_type: 'followupboss',
        first_name: crmLead.first_name || '',
        last_name: crmLead.last_name || '',
        full_name: `${crmLead.first_name || ''} ${crmLead.last_name || ''}`.trim() || 'No name',
        email: crmLead.email,
        phone: this.formatPhoneForStorage(crmLead.phone),
        source: crmLead.source || 'sms',
        tags: crmLead.tags || [],
        status: 'active',
        ai_status: 'inactive', // Default to inactive for safety
        metadata: {
          original_data: crmLead.crm_data || crmLead
        },
        last_synced_at: new Date()
      };
      
      // Upsert to Supabase
      const { data: upsertedLead, error } = await supabase
        .from('leads')
        .upsert(leadData, {
          onConflict: 'tenant_id,crm_lead_id,crm_type',
          ignoreDuplicates: false
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error upserting lead to Supabase:', error);
        throw error;
      }
      
      console.log(`✅ Lead synced to Supabase: ${upsertedLead.id}`);
      return upsertedLead;
      
    } catch (error) {
      console.error('Error syncing lead to Supabase:', error);
      throw error;
    }
  }

  /**
   * Format phone for storage (with country code)
   */
  formatPhoneForStorage(phone) {
    if (!phone) return null;
    
    const normalized = this.normalizePhone(phone);
    if (!normalized) return phone;
    
    // Add US country code
    return `+1${normalized}`;
  }

  /**
   * Verify phone numbers match between systems
   */
  async verifyPhoneMatch(leadId) {
    try {
      // Get from Supabase
      const { data: supabaseLead } = await supabase
        .from('leads')
        .select('phone, phone_secondary, crm_lead_id')
        .eq('id', leadId)
        .single();
      
      if (!supabaseLead) {
        console.error('Lead not found in Supabase');
        return false;
      }
      
      // Get from CRM
      const adapter = await CRMFactory.getAdapter(this.tenantId);
      const crmLead = await adapter.getLead(supabaseLead.crm_lead_id);
      
      if (!crmLead) {
        console.error('Lead not found in CRM');
        return false;
      }
      
      // Normalize and compare
      const supabasePhone = this.normalizePhone(supabaseLead.phone);
      const crmPhone = this.normalizePhone(crmLead.phone);
      
      const match = supabasePhone === crmPhone;
      
      if (!match) {
        console.warn(`⚠️ Phone mismatch for lead ${leadId}:`);
        console.warn(`  Supabase: ${supabasePhone}`);
        console.warn(`  CRM: ${crmPhone}`);
      } else {
        console.log(`✅ Phone numbers match for lead ${leadId}`);
      }
      
      return match;
    } catch (error) {
      console.error('Error verifying phone match:', error);
      return false;
    }
  }

  /**
   * Update phone number in both systems
   */
  async updatePhoneNumber(leadId, newPhoneNumber) {
    try {
      const formattedPhone = this.formatPhoneForStorage(newPhoneNumber);
      
      // Update in Supabase
      const { error: dbError } = await supabase
        .from('leads')
        .update({ 
          phone: formattedPhone,
          updated_at: new Date()
        })
        .eq('id', leadId);
      
      if (dbError) {
        throw dbError;
      }
      
      // Get CRM lead ID
      const { data: lead } = await supabase
        .from('leads')
        .select('crm_lead_id')
        .eq('id', leadId)
        .single();
      
      if (lead && lead.crm_lead_id) {
        // Update in CRM
        const adapter = await CRMFactory.getAdapter(this.tenantId);
        await adapter.updateLead(lead.crm_lead_id, {
          phone: newPhoneNumber
        });
        
        console.log(`✅ Phone updated in both systems for lead ${leadId}`);
      }
      
      return true;
    } catch (error) {
      console.error('Error updating phone number:', error);
      return false;
    }
  }

  /**
   * Batch verify all leads have matching phones
   */
  async verifyAllPhoneNumbers() {
    try {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, crm_lead_id, phone, full_name')
        .eq('tenant_id', this.tenantId)
        .not('phone', 'is', null);
      
      console.log(`🔍 Verifying ${leads.length} leads...`);
      
      const mismatches = [];
      
      for (const lead of leads) {
        const match = await this.verifyPhoneMatch(lead.id);
        if (!match) {
          mismatches.push(lead);
        }
      }
      
      if (mismatches.length > 0) {
        console.warn(`⚠️ Found ${mismatches.length} phone mismatches`);
        return { success: false, mismatches };
      }
      
      console.log('✅ All phone numbers match!');
      return { success: true, mismatches: [] };
      
    } catch (error) {
      console.error('Error in batch verification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PhoneMatchingService;