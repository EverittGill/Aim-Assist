/**
 * OrganizationService - Manages all tenant-related database operations
 * Uses service role to bypass RLS when needed
 * Provides tenant context for all operations
 */

const { supabase } = require('../../config/supabase');

class OrganizationService {
  constructor() {
    this.supabase = supabase;
    this.tenantCache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get tenant by ID with caching
   */
  async getTenantById(organizationId) {
    try {
      // Check cache first
      const cached = this.tenantCache.get(organizationId);
      if (cached && cached.expires > Date.now()) {
        console.log(`✅ Tenant ${organizationId} loaded from cache`);
        return cached.data;
      }

      // Query database
      const { data, error } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('❌ Error fetching tenant:', error);
        // Return cached version even if expired
        if (cached) {
          console.warn('⚠️ Using expired cache due to database error');
          return cached.data;
        }
        throw new Error(`Failed to fetch tenant: ${error.message}`);
      }

      // Update cache
      this.tenantCache.set(organizationId, {
        data,
        expires: Date.now() + this.cacheTimeout
      });

      console.log(`✅ Tenant ${data.name} loaded from database`);
      return data;
    } catch (error) {
      console.error('❌ OrganizationService.getTenantById error:', error);
      throw error;
    }
  }

  /**
   * Get tenant by slug (for login)
   */
  async getTenantBySlug(slug) {
    try {
      const { data, error } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // No tenant found
        }
        throw new Error(`Database error: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('❌ OrganizationService.getTenantBySlug error:', error);
      throw error;
    }
  }

  /**
   * Validate tenant is active and within limits
   */
  async validateTenantStatus(organizationId) {
    try {
      const tenant = await this.getTenantById(organizationId);
      
      if (!tenant) {
        return { valid: false, reason: 'Tenant not found' };
      }

      if (!tenant.is_active) {
        return { valid: false, reason: 'Tenant account suspended' };
      }

      if (tenant.subscription_status === 'canceled') {
        return { valid: false, reason: 'Subscription canceled' };
      }

      // Check trial expiration
      if (tenant.subscription_tier === 'trial' && tenant.trial_ends_at) {
        const trialEnd = new Date(tenant.trial_ends_at);
        if (trialEnd < new Date()) {
          return { valid: false, reason: 'Trial period expired' };
        }
      }

      return { valid: true, tenant };
    } catch (error) {
      console.error('❌ OrganizationService.validateTenantStatus error:', error);
      return { valid: false, reason: 'System error' };
    }
  }

  /**
   * Get tenant's CRM integrations
   */
  async getCRMIntegrations(organizationId) {
    try {
      const { data, error } = await this.supabase
        .from('crm_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Error fetching CRM integrations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ OrganizationService.getCRMIntegrations error:', error);
      return [];
    }
  }

  /**
   * Get tenant's communication channels (Twilio numbers)
   */
  async getCommunicationChannels(organizationId) {
    try {
      const { data, error } = await this.supabase
        .from('communication_channels')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Error fetching communication channels:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ OrganizationService.getCommunicationChannels error:', error);
      return [];
    }
  }

  /**
   * Get tenant's AI configuration
   */
  async getAIConfiguration(organizationId) {
    try {
      const { data, error } = await this.supabase
        .from('ai_configurations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No configuration found, return defaults
          return this.getDefaultAIConfiguration();
        }
        console.error('❌ Error fetching AI configuration:', error);
        return this.getDefaultAIConfiguration();
      }

      return data;
    } catch (error) {
      console.error('❌ OrganizationService.getAIConfiguration error:', error);
      return this.getDefaultAIConfiguration();
    }
  }

  /**
   * Default AI configuration
   */
  getDefaultAIConfiguration() {
    return {
      ai_provider: 'claude',
      ai_model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      max_tokens: 256,
      response_delay_seconds: 45,
      max_messages_before_alert: 3,
      auto_pause_hours: 2,
      escalation_keywords: ['human', 'agent', 'call me', 'not interested']
    };
  }

  /**
   * Update tenant usage metrics
   */
  async incrementUsage(organizationId, metricType, quantity = 1) {
    try {
      // Record in usage_tracking table
      const { error } = await this.supabase
        .from('usage_tracking')
        .insert({
          organization_id: organizationId,
          metric_type: metricType,
          quantity: quantity,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('⚠️ Failed to track usage:', error);
        // Don't throw - usage tracking shouldn't break the app
      }
    } catch (error) {
      console.error('⚠️ OrganizationService.incrementUsage error:', error);
      // Don't throw - usage tracking shouldn't break the app
    }
  }

  /**
   * Check if tenant has exceeded limits
   */
  async checkUsageLimits(organizationId, metricType) {
    try {
      const tenant = await this.getTenantById(organizationId);
      
      // Get current month's usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await this.supabase
        .from('usage_tracking')
        .select('quantity')
        .eq('organization_id', organizationId)
        .eq('metric_type', metricType)
        .gte('created_at', startOfMonth.toISOString());

      if (error) {
        console.error('⚠️ Failed to check usage limits:', error);
        return { withinLimits: true }; // Fail open
      }

      const totalUsage = (data || []).reduce((sum, row) => sum + row.quantity, 0);
      
      // Check against tenant limits
      let limit = Infinity;
      if (metricType === 'sms_sent' || metricType === 'sms_received') {
        limit = tenant.max_messages_per_month || 1000;
      } else if (metricType === 'lead_processed') {
        limit = tenant.max_leads || 100;
      }

      return {
        withinLimits: totalUsage < limit,
        currentUsage: totalUsage,
        limit: limit,
        remaining: Math.max(0, limit - totalUsage)
      };
    } catch (error) {
      console.error('❌ OrganizationService.checkUsageLimits error:', error);
      return { withinLimits: true }; // Fail open
    }
  }

  /**
   * Clear tenant cache (useful after updates)
   */
  clearCache(organizationId = null) {
    if (organizationId) {
      this.tenantCache.delete(organizationId);
    } else {
      this.tenantCache.clear();
    }
  }
}

// Export singleton instance
module.exports = new OrganizationService();