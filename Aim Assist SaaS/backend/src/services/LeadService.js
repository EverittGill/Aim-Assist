/**
 * Manages lead operations across all CRMs
 * Caches lead data in local database for performance
 * Syncs with CRM periodically
 * Tracks AI engagement status per lead
 */

const { supabase, withTenantContext } = require('../config/supabase');
const CRMFactory = require('./crm/CRMFactory');
const TranslationService = require('./TranslationService');

class LeadService {
  /**
   * Sync leads from CRM to local database
   */
  static async syncFromCRM(organizationId) {
    try {
      // Get CRM adapter for tenant
      const adapter = await CRMFactory.getAdapter(organizationId);
      const crmType = adapter.crmType || 'fub';
      const translator = new TranslationService(crmType);
      
      // Fetch all leads from CRM
      const crmLeads = await adapter.getLeads({ limit: 500 });
      
      let created = 0;
      let updated = 0;
      
      // Upsert each lead to local database
      for (const crmLead of crmLeads) {
        const existing = await this.getByPhone(organizationId, crmLead.phone);
        
        // Use translator to convert CRM data to Supabase format
        const leadData = translator.toSupabase(crmLead);
        leadData.organization_id = organizationId;
        leadData.last_synced_at = new Date();
        
        if (existing) {
          await this.update(existing.id, leadData);
          updated++;
        } else {
          await this.create(leadData);
          created++;
        }
      }
      
      return { created, updated, total: crmLeads.length };
    } catch (error) {
      console.error('Error syncing leads from CRM:', error);
      throw error;
    }
  }

  /**
   * Create a new lead
   */
  static async create(leadData) {
    try {
      // Mock implementation for testing
      if (!supabase) {
        const mockLead = {
          id: 'lead-' + Date.now(),
          ...leadData,
          created_at: new Date(),
          updated_at: new Date()
        };
        console.log('Mock lead created:', mockLead);
        return mockLead;
      }
      
      const { data, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Get lead by ID
   */
  static async getById(organizationId, leadId) {
    try {
      if (!supabase) {
        return {
          id: leadId,
          organization_id: organizationId,
          first_name: 'Test',
          last_name: 'Lead',
          phone: '+17068184445',
          ai_status: 'inactive'
        };
      }
      
      const { data, error } = await withTenantContext(organizationId, async (db) => {
        return db
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting lead:', error);
      throw error;
    }
  }

  /**
   * Get lead by phone number
   */
  static async getByPhone(organizationId, phoneNumber) {
    try {
      if (!phoneNumber) return null;
      
      // Normalize phone for search
      const normalizedPhone = this.normalizePhone(phoneNumber);
      
      if (!supabase) {
        console.log('Mock search for phone:', normalizedPhone);
        return null;
      }
      
      const { data, error } = await withTenantContext(organizationId, async (db) => {
        return db
          .from('leads')
          .select('*')
          .eq('phone', normalizedPhone)
          .single();
      });
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error finding lead by phone:', error);
      return null;
    }
  }

  /**
   * Update lead
   */
  static async update(leadId, updates) {
    try {
      if (!supabase) {
        console.log('Mock lead update:', { leadId, updates });
        return { id: leadId, ...updates };
      }
      
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  }

  /**
   * Get all leads for tenant
   */
  static async getAll(organizationId, filters = {}) {
    try {
      if (!supabase) {
        return [
          {
            id: 'lead-1',
            organization_id: organizationId,
            first_name: 'John',
            last_name: 'Doe',
            phone: '+17068184445',
            email: 'john@example.com',
            ai_status: 'active',
            ai_conversation_count: 5
          },
          {
            id: 'lead-2',
            organization_id: organizationId,
            first_name: 'Jane',
            last_name: 'Smith',
            phone: '+19045551234',
            email: 'jane@example.com',
            ai_status: 'paused',
            ai_conversation_count: 3
          }
        ];
      }
      
      let query = supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organizationId);
      
      // Apply filters
      if (filters.ai_status) {
        query = query.eq('ai_status', filters.ai_status);
      }
      
      if (filters.source) {
        query = query.eq('source', filters.source);
      }
      
      if (filters.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting leads:', error);
      throw error;
    }
  }

  /**
   * Update AI status for lead
   */
  static async updateAIStatus(leadId, status, pauseMinutes = null) {
    try {
      const updates = {
        ai_status: status,
        ai_paused_until: null
      };
      
      if (status === 'paused' && pauseMinutes) {
        updates.ai_paused_until = new Date(Date.now() + pauseMinutes * 60 * 1000);
      }
      
      return await this.update(leadId, updates);
    } catch (error) {
      console.error('Error updating AI status:', error);
      throw error;
    }
  }

  /**
   * Check if AI should respond to lead
   */
  static async shouldAIRespond(organizationId, leadId) {
    try {
      const lead = await this.getById(organizationId, leadId);
      
      if (!lead) return false;
      
      // Check if AI is inactive
      if (lead.ai_status === 'inactive') return false;
      
      // Check if permanently paused
      if (lead.ai_status === 'paused' && !lead.ai_paused_until) return false;
      
      // Check if temporarily paused
      if (lead.ai_paused_until) {
        const pausedUntil = new Date(lead.ai_paused_until);
        if (pausedUntil > new Date()) {
          return false; // Still paused
        }
        // Pause expired, reactivate
        await this.updateAIStatus(leadId, 'active');
      }
      
      return true;
    } catch (error) {
      console.error('Error checking AI status:', error);
      return false;
    }
  }

  /**
   * Get leads eligible for auto-text
   */
  static async getEligibleForAutoText(organizationId, source, hoursAgo = 24) {
    try {
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      
      if (!supabase) {
        return [];
      }
      
      const { data, error } = await withTenantContext(organizationId, async (db) => {
        return db
          .from('leads')
          .select('*')
          .eq('source', source)
          .eq('ai_status', 'inactive')
          .gt('created_at', cutoffTime.toISOString())
          .is('ai_last_contact_at', null)
          .limit(10);
      });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting eligible leads:', error);
      return [];
    }
  }

  /**
   * Normalize phone number to E.164 format
   */
  static normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle US numbers
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    return phone; // Return original if can't normalize
  }

  /**
   * Record AI conversation
   */
  static async recordConversation(leadId) {
    try {
      const lead = await this.getById(null, leadId);
      if (!lead) return;
      
      const updates = {
        ai_conversation_count: (lead.ai_conversation_count || 0) + 1,
        ai_last_contact_at: new Date(),
        ai_status: 'active'
      };
      
      return await this.update(leadId, updates);
    } catch (error) {
      console.error('Error recording conversation:', error);
    }
  }

  /**
   * Get conversation statistics
   */
  static async getStats(organizationId) {
    try {
      if (!supabase) {
        return {
          total: 10,
          active: 3,
          paused: 2,
          inactive: 5,
          conversations_today: 15,
          average_messages: 4.5
        };
      }
      
      const leads = await this.getAll(organizationId);
      
      const stats = {
        total: leads.length,
        active: leads.filter(l => l.ai_status === 'active').length,
        paused: leads.filter(l => l.ai_status === 'paused').length,
        inactive: leads.filter(l => l.ai_status === 'inactive').length,
        conversations_today: 0,
        average_messages: 0
      };
      
      // Calculate today's conversations
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      stats.conversations_today = leads.filter(l => {
        const lastContact = l.ai_last_contact_at ? new Date(l.ai_last_contact_at) : null;
        return lastContact && lastContact >= today;
      }).length;
      
      // Calculate average messages
      const totalMessages = leads.reduce((sum, l) => sum + (l.ai_conversation_count || 0), 0);
      stats.average_messages = leads.length > 0 ? (totalMessages / leads.length).toFixed(1) : 0;
      
      return stats;
    } catch (error) {
      console.error('Error getting lead stats:', error);
      throw error;
    }
  }
}

module.exports = LeadService;