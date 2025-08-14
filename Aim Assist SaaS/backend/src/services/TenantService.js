/**
 * Manages tenant (company) operations
 * - Create new tenant on signup
 * - Get tenant by ID or subdomain
 * - Update tenant settings
 * - Check subscription status
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

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error recording usage:', error);
      throw error;
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
}

module.exports = TenantService;