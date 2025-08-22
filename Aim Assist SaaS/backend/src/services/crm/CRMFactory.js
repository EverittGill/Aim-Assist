/**
 * Factory pattern to instantiate correct CRM adapter
 * Loads tenant's CRM configuration from database
 * Decrypts credentials from Supabase Vault
 * Returns configured adapter instance
 */

const { supabase } = require('../../config/supabase');
const FollowUpBossAdapter = require('./adapters/FollowUpBossAdapter');
const LoftyAdapter = require('./adapters/LoftyAdapter');

class CRMFactory {
  // Map CRM types to adapter classes
  static adapters = {
    'fub': FollowUpBossAdapter,
    'followupboss': FollowUpBossAdapter,
    'lofty': LoftyAdapter,
    'chime': LoftyAdapter // Alias for Lofty
  };

  /**
   * Get configured CRM adapter for tenant
   * @param {string} tenantId - Tenant UUID
   * @returns {Promise<CRMAdapter>} - Configured adapter instance
   */
  static async getAdapter(tenantId) {
    try {
      // For MVP, use demo tenant credentials from env when Supabase isn't available
      // or for the primary test tenant
      if (tenantId === 'demo-tenant' || !supabase || tenantId === '7c563f31-36bd-4414-ad44-ef9c19c1c6b1') {
        console.log('Using FUB configuration from environment');
        const FollowUpBossAdapter = require('./adapters/FollowUpBossAdapter');
        
        const config = {
          credentials: {
            api_key: process.env.DEMO_FUB_API_KEY || process.env.FUB_API_KEY,
            x_system: process.env.DEMO_FUB_X_SYSTEM || process.env.FUB_X_SYSTEM,
            x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY || process.env.FUB_X_SYSTEM_KEY
          },
          settings: {
            user_id: process.env.FUB_USER_ID_FOR_AI || '1'
          }
        };
        
        return new FollowUpBossAdapter(tenantId, config);
      }
      
      // Get CRM integration config from database
      const integration = await this.getCRMIntegration(tenantId);
      
      if (!integration) {
        throw new Error(`No CRM integration found for tenant ${tenantId}`);
      }

      if (!integration.is_active) {
        throw new Error(`CRM integration is not active for tenant ${tenantId}`);
      }

      // Get adapter class
      const AdapterClass = this.adapters[integration.crm_type.toLowerCase()];
      
      if (!AdapterClass) {
        throw new Error(`Unsupported CRM type: ${integration.crm_type}`);
      }

      // Get credentials - use direct credentials if no vault_secret_id
      let credentials;
      if (integration.credentials) {
        // Use credentials directly from database (for MVP)
        credentials = integration.credentials;
      } else {
        // Decrypt from vault if available
        credentials = await this.decryptCredentials(integration.vault_secret_id);
      }
      
      // Create adapter config
      const config = {
        credentials,
        fieldMappings: integration.field_mappings,
        ...integration.config
      };

      // Instantiate and return adapter
      return new AdapterClass(tenantId, config);
    } catch (error) {
      console.error('Error creating CRM adapter:', error);
      throw error;
    }
  }

  /**
   * Get CRM integration from database
   */
  static async getCRMIntegration(tenantId) {
    // For testing without Supabase
    if (!supabase) {
      console.log('Mock CRM integration for tenant:', tenantId);
      return {
        id: 'mock-integration',
        tenant_id: tenantId,
        crm_type: 'fub',
        is_active: true,
        config: {},
        field_mappings: null,
        vault_secret_id: 'mock-secret'
      };
    }

    const { data, error } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching CRM integration:', error);
      return null;
    }

    return data;
  }

  /**
   * Decrypt credentials from vault
   */
  static async decryptCredentials(vaultSecretId) {
    // For testing without Supabase vault
    if (!supabase || !vaultSecretId || vaultSecretId === 'mock-secret') {
      // Return test credentials from environment
      return {
        api_key: process.env.TEST_FUB_API_KEY || 'test_api_key',
        x_system: process.env.TEST_FUB_X_SYSTEM || 'test_system',
        x_system_key: process.env.TEST_FUB_X_SYSTEM_KEY || 'test_system_key',
        user_id: process.env.TEST_FUB_USER_ID
      };
    }

    // In production, decrypt from vault
    const { data, error } = await supabase
      .rpc('decrypt_secret', { secret_id: vaultSecretId });

    if (error) {
      console.error('Error decrypting credentials:', error);
      throw new Error('Failed to decrypt CRM credentials');
    }

    return JSON.parse(data);
  }

  /**
   * Store CRM credentials securely
   */
  static async storeCredentials(tenantId, crmType, credentials) {
    // For testing without Supabase
    if (!supabase) {
      console.log('Mock storing credentials for:', crmType);
      return 'mock-secret-id';
    }

    // Store in vault (placeholder - needs Supabase Vault setup)
    const { data, error } = await supabase
      .rpc('store_crm_credentials', {
        p_tenant_id: tenantId,
        p_crm_type: crmType,
        p_credentials: credentials
      });

    if (error) {
      console.error('Error storing credentials:', error);
      throw error;
    }

    return data;
  }

  /**
   * Create or update CRM integration
   */
  static async createIntegration(tenantId, crmType, credentials, config = {}) {
    try {
      // Store credentials securely
      const vaultSecretId = await this.storeCredentials(tenantId, crmType, credentials);

      // For testing without Supabase
      if (!supabase) {
        console.log('Mock integration created');
        return {
          id: 'mock-integration-' + Date.now(),
          tenant_id: tenantId,
          crm_type: crmType,
          vault_secret_id: vaultSecretId,
          is_active: true
        };
      }

      // Create integration record
      const { data, error } = await supabase
        .from('crm_integrations')
        .upsert({
          tenant_id: tenantId,
          crm_type: crmType,
          vault_secret_id: vaultSecretId,
          config,
          is_active: true,
          is_primary: true // Make it primary by default
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating integration:', error);
      throw error;
    }
  }

  /**
   * Test CRM connection
   */
  static async testConnection(tenantId, crmType, credentials) {
    try {
      // Create temporary adapter with provided credentials
      const AdapterClass = this.adapters[crmType.toLowerCase()];
      
      if (!AdapterClass) {
        throw new Error(`Unsupported CRM type: ${crmType}`);
      }

      const adapter = new AdapterClass(tenantId, { credentials });
      return await adapter.testConnection();
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * List supported CRM types
   */
  static getSupportedCRMs() {
    return [
      {
        id: 'fub',
        name: 'Follow Up Boss',
        status: 'active',
        requiredFields: ['api_key', 'x_system', 'x_system_key']
      },
      {
        id: 'lofty',
        name: 'Lofty (Chime)',
        status: 'coming_soon',
        requiredFields: ['api_key', 'workspace_id']
      }
    ];
  }

  /**
   * Get adapter for multiple tenants (batch operation)
   */
  static async getAdapters(tenantIds) {
    const adapters = {};
    
    for (const tenantId of tenantIds) {
      try {
        adapters[tenantId] = await this.getAdapter(tenantId);
      } catch (error) {
        console.error(`Failed to get adapter for tenant ${tenantId}:`, error);
        adapters[tenantId] = null;
      }
    }
    
    return adapters;
  }
}

module.exports = CRMFactory;