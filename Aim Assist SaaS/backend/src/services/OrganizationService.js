/**
 * Manages tenant (company) operations
 * - Create new tenant on signup
 * - Get tenant by ID or subdomain
 * - Update tenant settings
 * - Check subscription status
 * - Support brokerage/agent hierarchy
 */

const { supabase, withOrganizationContext } = require('../config/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class OrganizationService {
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

      // Require Supabase for organization creation
      if (!supabase) {
        throw new Error('Database connection required for organization creation');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
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
  static async getById(organizationId) {
    try {
      if (!supabase) {
        throw new Error('Database connection required to fetch organization');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
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
        throw new Error('Database connection required to fetch organization by subdomain');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
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
  static async updateSettings(organizationId, settings) {
    try {
      if (!supabase) {
        throw new Error('Database connection required to update settings');
      }

      // Merge with existing settings
      const { data: current, error: fetchError } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .single();

      if (fetchError) throw fetchError;

      const updatedSettings = {
        ...current.settings,
        ...settings
      };

      const { data: tenant, error } = await supabase
        .from('organizations')
        .update({ settings: updatedSettings })
        .eq('id', organizationId)
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
  static async checkUsageLimit(organizationId, metricType) {
    try {
      if (!supabase) {
        // Return safe defaults for usage checking when DB unavailable
        console.warn('Database unavailable - returning default usage limits');
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
          p_organization_id: organizationId,
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
  static async recordUsage(organizationId, metricType, quantity = 1, metadata = {}) {
    try {
      if (!supabase) {
        console.warn('Database unavailable - usage not recorded');
        return { success: false, reason: 'database_unavailable' };
      }

      const currentDate = new Date();
      const billingPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const billingPeriodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('usage_metrics')
        .insert([{
          organization_id: organizationId,
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
        throw new Error('Database connection required to list organizations');
      }

      let query = supabase
        .from('organizations')
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
  static async upgradeSubscription(organizationId, plan) {
    try {
      if (!supabase) {
        throw new Error('Database connection required to upgrade subscription');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
        .update({
          subscription_plan: plan,
          subscription_status: 'active',
          trial_ends_at: null
        })
        .eq('id', organizationId)
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
  static async cancelSubscription(organizationId, reason) {
    try {
      if (!supabase) {
        throw new Error('Database connection required to cancel subscription');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
        .update({
          subscription_status: 'cancelled',
          subscription_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days grace period
        })
        .eq('id', organizationId)
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
        parent_organization_id: null,
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
        throw new Error('Database connection required to create brokerage');
      }

      const { data: tenant, error } = await supabase
        .from('organizations')
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
        parent_organization_id: brokerageId,
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
        throw new Error('Database connection required to create agent');
      }

      const { data: agent, error } = await supabase
        .from('organizations')
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
  static async getTenantConfig(organizationId) {
    try {
      const tenant = await this.getById(organizationId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // If agent, merge with brokerage settings
      if (tenant.type === 'agent' && tenant.parent_organization_id) {
        const brokerage = await this.getById(tenant.parent_organization_id);
        
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
  static async shouldSyncLead(organizationId, leadTags = []) {
    try {
      const config = await this.getTenantConfig(organizationId);
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
        .from('organizations')
        .select('*')
        .eq('parent_organization_id', brokerageId)
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
        .from('organizations')
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

module.exports = OrganizationService;