/**
 * Setup CRM Integrations for Existing Tenants
 * 
 * This script creates CRM integration records for existing tenants
 * using their environment variables for FUB credentials
 */

require('dotenv').config();
const { supabase } = require('../src/config/supabase');

async function setupCRMIntegrations() {
  console.log('🔧 Setting up CRM integrations for existing tenants...\n');
  
  try {
    // Get all active tenants
    const { data: tenants, error: fetchError } = await supabase
      .from('tenants')
      .select('id, name, subdomain')
      .eq('status', 'active');
    
    if (fetchError) {
      console.error('❌ Error fetching tenants:', fetchError);
      return;
    }
    
    console.log(`📋 Found ${tenants.length} active tenants\n`);
    
    // FUB credentials - use test/placeholder for now
    // In production, each tenant would have their own credentials
    const fubCredentials = {
      api_key: process.env.FUB_API_KEY || 'fka_078sqVF2JGbqQRW1bKXwj8tH9elJsTsTIJ', // From eugenia-backend
      x_system: process.env.FUB_X_SYSTEM || 'AimAssist',
      x_system_key: process.env.FUB_X_SYSTEM_KEY || 'a4c96cb91e88f9e3e3bb19f81f0037d7',
      user_id: process.env.FUB_USER_ID || '19156'
    };
    
    console.log('📝 Using FUB credentials (will be tenant-specific in production)');
    
    // Create CRM integration for each tenant
    for (const tenant of tenants) {
      console.log(`\n🏢 Processing tenant: ${tenant.name} (${tenant.id})`);
      
      // Check if integration already exists
      const { data: existing } = await supabase
        .from('crm_integrations')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('crm_type', 'fub')
        .single();
      
      if (existing) {
        console.log('   ✅ CRM integration already exists');
        continue;
      }
      
      // First, let's check what columns exist
      const { data: tableInfo, error: infoError } = await supabase
        .from('crm_integrations')
        .select('*')
        .limit(0);
      
      if (infoError && infoError.message.includes('column')) {
        console.log('   ⚠️ Table structure issue, attempting simplified insert...');
        
        // Simplified insert with basic fields
        const simpleData = {
          tenant_id: tenant.id,
          crm_type: 'fub',
          is_active: true,
          is_primary: true
        };
        
        const { data: simpleIntegration, error: simpleError } = await supabase
          .from('crm_integrations')
          .insert(simpleData)
          .select()
          .single();
          
        if (simpleError) {
          console.error(`   ❌ Simplified insert also failed:`, simpleError.message);
          continue;
        } else {
          console.log(`   ✅ Created basic FUB integration: ${simpleIntegration.id}`);
          continue;
        }
      }
      
      // Create new CRM integration with full data
      const integrationData = {
        tenant_id: tenant.id,
        crm_type: 'fub',
        is_active: true,
        is_primary: true,
        api_credentials: fubCredentials,
        sync_config: {
          sync_interval_minutes: 15,
          sync_enabled: true,
          sync_direction: 'bidirectional',
          field_mappings: {
            // Map FUB fields to our standard fields
            first_name: 'firstName',
            last_name: 'lastName',
            email: 'emails[0].value',
            phone: 'phones[0].value',
            source: 'source',
            tags: 'tags',
            created: 'created',
            updated: 'updated',
            // Custom fields
            eugenia_status: 'customEugeniaTalkingStatus',
            aim_assist_link: 'customAimAssist'
          }
        },
        webhook_config: {
          // Webhook configuration if needed
          enabled: false
        },
        last_sync_at: null,
        last_sync_status: 'pending'
      };
      
      const { data: integration, error: insertError } = await supabase
        .from('crm_integrations')
        .insert(integrationData)
        .select()
        .single();
      
      if (insertError) {
        console.error(`   ❌ Error creating integration:`, insertError.message);
      } else {
        console.log(`   ✅ Created FUB integration: ${integration.id}`);
        
        // Update tenant's crm_type
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ 
            crm_type: 'fub',
            crm_api_config: {
              primary_integration_id: integration.id
            }
          })
          .eq('id', tenant.id);
        
        if (updateError) {
          console.error(`   ⚠️ Error updating tenant:`, updateError.message);
        } else {
          console.log(`   ✅ Updated tenant CRM type to 'fub'`);
        }
      }
    }
    
    console.log('\n✅ CRM integration setup complete!\n');
    
    // Verify setup
    const { data: verifyData } = await supabase
      .from('crm_integrations')
      .select('tenant_id, crm_type, is_active, last_sync_status');
    
    console.log('📊 Current CRM Integrations:');
    console.table(verifyData);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
  
  process.exit(0);
}

// Run the setup
setupCRMIntegrations();