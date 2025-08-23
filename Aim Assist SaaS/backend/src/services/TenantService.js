/**
 * Manages tenant (company) operations
 * - Create new tenant on signup
 * - Get tenant by ID or subdomain
 * - Update tenant settings
 * - Check subscription status
 * - Support brokerage/agent hierarchy
 */

const { supabase, withTenantContext } = require('../config/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class TenantService {
  /**
   * Create a new tenant
   * Sets up trial period and Stripe customer
   */
  static async create(data) {
    try {
      const {
        name,
        subdomain,
        industry = 'real_estate',
        owner_email,
        owner_name
      } = data;

      // Validate subdomain format
      if (!subdomain.match(/^[a-z0-9-]+$/)) {
        throw new Error('Subdomain must contain only lowercase letters, numbers, and hyphens');
      }

      // Create Stripe customer if Stripe is configured
      let stripeCustomerId = null;
      if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_your_stripe_secret_key') {
        const customer = await stripe.customers.create({
          email: owner_email,
          name: owner_name || name,
          metadata: {
            tenant_name: name,
            subdomain: subdomain
          }
        });
        stripeCustomerId = customer.id;
      }

      // Create tenant in database
      const tenantData = {
        name,
        subdomain: subdomain.toLowerCase(),
        industry,
        subscription_status: 'trial',
        subscription_plan: 'starter',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        stripe_customer_id: stripeCustomerId,
        settings: {
          auto_text_enabled: false,
          auto_text_sources: [],
          auto_text_delay_minutes: 5,
          business_hours_enabled: false,
          business_hours: { start: '09:00', end: '17:00' },
          timezone: 'America/New_York',
          ai_provider: 'gemini',
          ai_temperature: 0.7,
          sms_limit_monthly: 1000,
          lead_limit_monthly: 500
        }
      };

      // Insert tenant (will work even without Supabase for testing)
      if (!supabase) {
        console.log('Mock tenant created:', tenantData);
        return { ...tenantData, id: 'mock-tenant-' + Date.now() };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .insert([tenantData])
        .select()
        .single();

      if (error) throw error;

      return tenant;
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  static async getById(tenantId) {
    try {
      if (!supabase) {
        return {
          id: tenantId,
          name: 'Mock Tenant',
          subdomain: 'mock',
          subscription_status: 'trial',
          subscription_plan: 'starter'
        };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      return tenant;
    } catch (error) {
      console.error('Error getting tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by subdomain
   */
  static async getBySubdomain(subdomain) {
    try {
      if (!supabase) {
        return {
          id: 'mock-tenant-id',
          name: 'Mock Tenant',
          subdomain: subdomain,
          subscription_status: 'trial',
          subscription_plan: 'starter'
        };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('subdomain', subdomain.toLowerCase())
        .single();

      if (error) throw error;
      return tenant;
    } catch (error) {
      console.error('Error getting tenant by subdomain:', error);
      throw error;
    }
  }

  /**
   * Update tenant settings
   */
  static async updateSettings(tenantId, settings) {
    try {
      if (!supabase) {
        console.log('Mock settings update:', settings);
        return { id: tenantId, settings };
      }

      // Merge with existing settings
      const { data: current, error: fetchError } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      if (fetchError) throw fetchError;

      const updatedSettings = {
        ...current.settings,
        ...settings
      };

      const { data: tenant, error } = await supabase
        .from('tenants')
        .update({ settings: updatedSettings })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return tenant;
    } catch (error) {
      console.error('Error updating tenant settings:', error);
      throw error;
    }
  }

  /**
   * Check if tenant has exceeded usage limits
   */
  static async checkUsageLimit(tenantId, metricType) {
    try {
      if (!supabase) {
        return {
          current_usage: 0,
          plan_limit: 1000,
          is_over_limit: false,
          overage_amount: 0
        };
      }

      // Call the database function
      const { data, error } = await supabase
        .rpc('check_usage_limit', {
          p_tenant_id: tenantId,
          p_metric_type: metricType
        });

      if (error) throw error;
      return data[0] || {
        current_usage: 0,
        plan_limit: null,
        is_over_limit: false,
        overage_amount: 0
      };
    } catch (error) {
      console.error('Error checking usage limit:', error);
      throw error;
    }
  }

  /**
   * Record usage metric
   */
  static async recordUsage(tenantId, metricType, quantity = 1, metadata = {}) {
    try {
      if (!supabase) {
        console.log('Mock usage recorded:', { tenantId, metricType, quantity });
        return { success: true };
      }

      const currentDate = new Date();
      const billingPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const billingPeriodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('usage_metrics')
        .insert([{
          tenant_id: tenantId,
          metric_type: metricType,
          quantity,
          billing_period_start: billingPeriodStart,
          billing_period_end: billingPeriodEnd,
          metadata
        }]);

      if (error) {
        console.warn('⚠️ Usage metrics table not available:', error.message);
        // Don't throw - this is not critical
        return { success: false, reason: 'table_missing' };
      }
      return { success: true };
    } catch (error) {
      console.warn('⚠️ Failed to record usage:', error.message);
      // Don't throw - this is not critical for SMS delivery
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all tenants (admin only)
   */
  static async getAll(filters = {}) {
    try {
      if (!supabase) {
        return [{
          id: 'mock-tenant-1',
          name: 'Mock Tenant 1',
          subdomain: 'mock1',
          subscription_status: 'trial'
        }];
      }

      let query = supabase
        .from('tenants')
        .select('*')
        .is('deleted_at', null);

      if (filters.subscription_status) {
        query = query.eq('subscription_status', filters.subscription_status);
      }

      if (filters.subscription_plan) {
        query = query.eq('subscription_plan', filters.subscription_plan);
      }

      const { data: tenants, error } = await query;

      if (error) throw error;
      return tenants;
    } catch (error) {
      console.error('Error getting all tenants:', error);
      throw error;
    }
  }

  /**
   * Upgrade tenant subscription
   */
  static async upgradeSubscription(tenantId, plan) {
    try {
      if (!supabase) {
        console.log('Mock subscription upgrade:', { tenantId, plan });
        return { success: true, plan };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .update({
          subscription_plan: plan,
          subscription_status: 'active',
          trial_ends_at: null
        })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;

      // TODO: Create Stripe subscription

      return tenant;
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel tenant subscription
   */
  static async cancelSubscription(tenantId, reason) {
    try {
      if (!supabase) {
        console.log('Mock subscription cancelled:', { tenantId, reason });
        return { success: true };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .update({
          subscription_status: 'cancelled',
          subscription_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days grace period
        })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;

      // TODO: Cancel Stripe subscription

      return tenant;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Create a new brokerage tenant
   */
  static async createBrokerage(data) {
    const { 
      name, 
      email, 
      phone,
      twilioPhone,
      notificationPhone,
      crmConfig,
      leadTags = ['AI Ready', 'Auto Nurture']
    } = data;
    
    try {
      const tenantData = {
        name,
        email,
        phone,
        type: 'brokerage',
        parent_tenant_id: null,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        subdomain: name.toLowerCase().replace(/\s+/g, '-'),
        subscription_status: 'active',
        subscription_plan: 'starter',
        subscription_tier: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        settings: {
          twilio_phone: twilioPhone,
          notification_phone: notificationPhone,
          lead_sync_tags: leadTags,
          crm_config: crmConfig,
          features: {
            ai_enabled: true,
            nurturing_enabled: true,
            property_alerts_enabled: true
          }
        },
        status: 'active'
      };

      if (!supabase) {
        console.log('Mock brokerage created:', tenantData);
        return { ...tenantData, id: 'mock-brokerage-' + Date.now() };
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .insert(tenantData)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ Created brokerage tenant: ${tenant.id} - ${name}`);
      return tenant;
      
    } catch (error) {
      console.error('Error creating brokerage:', error);
      throw error;
    }
  }
  
  /**
   * Create a sub-tenant (agent) under a brokerage
   */
  static async createAgent(brokerageId, data) {
    const { 
      name, 
      email, 
      phone,
      notificationPhone 
    } = data;
    
    try {
      // Verify brokerage exists
      const brokerage = await this.getById(brokerageId);
      
      if (!brokerage) {
        throw new Error('Brokerage not found');
      }
      
      const agentData = {
        name,
        email,
        phone,
        type: 'agent',
        parent_tenant_id: brokerageId,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        subdomain: name.toLowerCase().replace(/\s+/g, '-'),
        subscription_status: 'active', // Inherits from brokerage
        subscription_plan: brokerage.subscription_plan,
        subscription_tier: brokerage.subscription_tier || 'trial',
        settings: {
          notification_phone: notificationPhone,
          // Inherit brokerage settings
          twilio_phone: brokerage.settings.twilio_phone,
          lead_sync_tags: brokerage.settings.lead_sync_tags,
          crm_config: brokerage.settings.crm_config,
          features: brokerage.settings.features
        },
        status: 'active'
      };

      if (!supabase) {
        console.log('Mock agent created:', agentData);
        return { ...agentData, id: 'mock-agent-' + Date.now() };
      }

      const { data: agent, error } = await supabase
        .from('tenants')
        .insert(agentData)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ Created agent ${agent.id} under brokerage ${brokerageId}`);
      return agent;
      
    } catch (error) {
      console.error('Error creating agent:', error);
      throw error;
    }
  }
  
  /**
   * Get tenant configuration (handles hierarchy)
   */
  static async getTenantConfig(tenantId) {
    try {
      const tenant = await this.getById(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // If agent, merge with brokerage settings
      if (tenant.type === 'agent' && tenant.parent_tenant_id) {
        const brokerage = await this.getById(tenant.parent_tenant_id);
        
        if (brokerage) {
          // Agent settings override brokerage defaults
          tenant.settings = {
            ...brokerage.settings,
            ...tenant.settings,
            notification_phone: tenant.settings.notification_phone // Keep agent's own notification
          };
        }
      }
      
      return tenant;
      
    } catch (error) {
      console.error('Error getting tenant config:', error);
      throw error;
    }
  }
  
  /**
   * Check if a lead should sync to Supabase based on tags
   */
  static async shouldSyncLead(tenantId, leadTags = []) {
    try {
      const config = await this.getTenantConfig(tenantId);
      const requiredTags = config.settings?.lead_sync_tags || [];
      
      if (requiredTags.length === 0) {
        return true; // No tag filter, sync all
      }
      
      // Check if lead has any required tag
      const hasRequiredTag = requiredTags.some(tag => 
        leadTags.some(leadTag => 
          leadTag.toLowerCase() === tag.toLowerCase()
        )
      );
      
      console.log(`🏷️ Lead tags: ${leadTags.join(', ')}`);
      console.log(`🏷️ Required tags: ${requiredTags.join(', ')}`);
      console.log(`🏷️ Should sync: ${hasRequiredTag}`);
      
      return hasRequiredTag;
      
    } catch (error) {
      console.error('Error checking lead sync eligibility:', error);
      return false;
    }
  }
  
  /**
   * Get all agents under a brokerage
   */
  static async getBrokerageAgents(brokerageId) {
    try {
      if (!supabase) {
        return [];
      }

      const { data: agents } = await supabase
        .from('tenants')
        .select('*')
        .eq('parent_tenant_id', brokerageId)
        .eq('type', 'agent')
        .eq('status', 'active');
      
      return agents || [];
      
    } catch (error) {
      console.error('Error getting brokerage agents:', error);
      return [];
    }
  }
  
  /**
   * Get tenant by phone number (for incoming SMS routing)
   */
  static async getTenantByPhone(phoneNumber) {
    try {
      if (!supabase) {
        return null;
      }

      // Normalize phone for comparison
      const normalized = phoneNumber.replace(/\D/g, '');
      
      const { data: tenants } = await supabase
        .from('tenants')
        .select('*');
      
      // Search in settings JSON field
      const tenant = tenants?.find(t => {
        const twilioPhone = t.settings?.twilio_phone?.replace(/\D/g, '');
        return twilioPhone && twilioPhone.includes(normalized);
      });
      
      return tenant || null;
      
    } catch (error) {
      console.error('Error finding tenant by phone:', error);
      return null;
    }
  }
}

module.exports = TenantService;