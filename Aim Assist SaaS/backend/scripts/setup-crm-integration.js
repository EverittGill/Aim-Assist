/**
 * Script to set up CRM integration for tenant
 * Creates the necessary record in crm_integrations table
 */

// Load environment variables first
require('dotenv').config({ path: __dirname + '/../.env' });

const { supabase } = require('../src/config/supabase');

async function setupCRMIntegration() {
  const tenantId = 'e5669fe6-a161-4628-89e3-4b8e01f663b8'; // Your tenant ID
  
  console.log('🔧 Setting up CRM integration for tenant:', tenantId);
  
  try {
    // First check if integration already exists
    const { data: existing, error: checkError } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();
    
    if (existing && !checkError) {
      console.log('✅ CRM integration already exists:', existing);
      return existing;
    }
    
    // Create new integration with minimal fields to match database schema
    const { data, error } = await supabase
      .from('crm_integrations')
      .insert({
        tenant_id: tenantId,
        crm_type: 'fub',
        is_active: true,
        is_primary: true,
        credentials: {
          api_key: process.env.FUB_API_KEY || process.env.DEMO_FUB_API_KEY,
          x_system: process.env.FUB_X_SYSTEM || process.env.DEMO_FUB_X_SYSTEM,
          x_system_key: process.env.FUB_X_SYSTEM_KEY || process.env.DEMO_FUB_X_SYSTEM_KEY,
          user_id: process.env.FUB_USER_ID_FOR_AI || '1'
        },
        config: {
          sync_interval_minutes: 15,
          auto_sync_enabled: true
        },
        field_mappings: {
          ai_status: 'customEugeniaTalkingStatus',
          conversation_link: 'customAimAssist',
          paused_until: 'customEugeniaPausedUntil'
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error creating CRM integration:', error);
      throw error;
    }
    
    console.log('✅ CRM integration created successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to setup CRM integration:', error);
    process.exit(1);
  }
}

// Run the setup
setupCRMIntegration().then(() => {
  console.log('🎉 CRM integration setup complete!');
  process.exit(0);
});