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
   * Get configured CRM adapter for organization
   * @param {string} organizationId - Organization UUID
   * @returns {Promise<CRMAdapter>} - Configured adapter instance
   */
  static async getAdapter(organizationId) {
    // Support both parameter names during transition
    const orgId = organizationId;
    try {
      // For MVP, use demo organization credentials from env when Supabase isn't available
      // or for the primary test organization or Everitt's organization
      // Also handle numeric organization ID 1 and our organization ID
      if (orgId === 'demo-tenant' || !supabase || 
          orgId === '7c563f31-36bd-4414-ad44-ef9c19c1c6b1' ||
          orgId === 'e5669fe6-a161-4628-89e3-4b8e01f663b8' ||
          orgId === 1 || orgId === '1' ||
          orgId === '655cd229-b2e9-4737-843b-7488fe9d33e6') {
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
        
        return new FollowUpBossAdapter(orgId, config);
      }
      
      // Get CRM integration config from database
      const integration = await this.getCRMIntegration(orgId);
      
      if (!integration) {
        throw new Error(`No CRM integration found for organization ${orgId}`);
      }

      if (!integration.is_active) {
        throw new Error(`CRM integration is not active for organization ${orgId}`);
      }

      // Get adapter class
      const AdapterClass = this.adapters[integration.crm_type.toLowerCase()];
      
      if (!AdapterClass) {
        throw new Error(`Unsupported CRM type: ${integration.crm_type}`);
      }

      // Get credentials - handle encrypted credentials from crm_configs table
      let credentials;
      if (integration.credentials_encrypted) {
        // Parse encrypted credentials (they're stored as JSON string)
        const parsed = JSON.parse(integration.credentials_encrypted);
        // Transform credential keys to match adapter expectations
        credentials = {
          api_key: parsed.apiKey || parsed.api_key,
          x_system: integration.config?.x_system || parsed.xSystem || parsed.x_system,
          x_system_key: parsed.xSystemKey || parsed.x_system_key
        };
      } else if (integration.credentials) {
        // Use credentials directly from database (legacy)
        credentials = integration.credentials;
      } else {
        // Decrypt from vault if available
        credentials = await this.decryptCredentials(integration.vault_secret_id);
      }
      
      // Create adapter config
      const config = {
        credentials,
        fieldMappings: integration.field_mappings,
        settings: integration.config || {},
        ...integration.config
      };

      // Instantiate and return adapter
      return new AdapterClass(orgId, config);
    } catch (error) {
      console.error('Error creating CRM adapter:', error);
      throw error;
    }
  }

  /**
   * Get CRM integration from database
   */
  static async getCRMIntegration(organizationId) {
    // For testing without Supabase
    if (!supabase) {
      console.log('Mock CRM integration for organization:', organizationId);
      return {
        id: 'mock-integration',
        organization_id: organizationId,  // Keep as organization_id for DB compatibility
        organization_id: organizationId,
        crm_type: 'fub',
        is_active: true,
        config: {},
        field_mappings: null,
        vault_secret_id: 'mock-secret'
      };
    }

    // Check crm_configs table
    const { data, error } = await supabase
      .from('crm_configs')
      .select('*')
      .eq('organization_id', organizationId)
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
  static async storeCredentials(organizationId, crmType, credentials) {
    // For testing without Supabase
    if (!supabase) {
      console.log('Mock storing credentials for:', crmType);
      return 'mock-secret-id';
    }

    // Store in vault (placeholder - needs Supabase Vault setup)
    const { data, error } = await supabase
      .rpc('store_crm_credentials', {
        p_organization_id: organizationId,  // Keep parameter name as expected by DB
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
  static async createIntegration(organizationId, crmType, credentials, config = {}) {
    try {
      // Store credentials securely
      const vaultSecretId = await this.storeCredentials(organizationId, crmType, credentials);

      // For testing without Supabase
      if (!supabase) {
        console.log('Mock integration created');
        return {
          id: 'mock-integration-' + Date.now(),
          organization_id: organizationId,
          crm_type: crmType,
          vault_secret_id: vaultSecretId,
          is_active: true
        };
      }

      // Create integration record
      const { data, error } = await supabase
        .from('crm_integrations')
        .upsert({
          organization_id: organizationId,
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
  static async testConnection(organizationId, crmType, credentials) {
    try {
      // Create temporary adapter with provided credentials
      const AdapterClass = this.adapters[crmType.toLowerCase()];
      
      if (!AdapterClass) {
        throw new Error(`Unsupported CRM type: ${crmType}`);
      }

      const adapter = new AdapterClass(organizationId, { credentials });
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
  static async getAdapters(organizationIds) {
    const adapters = {};
    
    for (const organizationId of organizationIds) {
      try {
        adapters[organizationId] = await this.getAdapter(organizationId);
      } catch (error) {
        console.error(`Failed to get adapter for tenant ${organizationId}:`, error);
        adapters[organizationId] = null;
      }
    }
    
    return adapters;
  }
}

module.exports = CRMFactory;