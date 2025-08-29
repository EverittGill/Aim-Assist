#!/usr/bin/env node

/**
 * Setup test tenant with CRM integration
 * Creates necessary database records for testing
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function setupTestTenant() {
  console.log('🚀 Setting up test tenant and CRM integration...\n');
  
  try {
    // 1. Check/Create tenant with UUID
    const tenantUuid = '00000000-0000-0000-0000-000000000001'; // Test tenant UUID
    
    console.log('📍 Checking for test tenant...');
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantUuid)
      .single();
    
    let tenant;
    if (existingTenant) {
      console.log('✅ Test tenant exists');
      tenant = existingTenant;
    } else {
      console.log('Creating test tenant...');
      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          id: tenantUuid,
          name: 'Demo Tenant',
          organization_id: '655cd229-b2e9-4737-843b-7488fe9d33e6',
          crm_type: 'fub',
          is_active: true,
          settings: {
            agency_name: 'Demo Agency',
            auto_text_enabled: true,
            tag_polling: [{
              tagName: 'AIM_ASSIST',
              intervalMinutes: 3,
              enableAI: true,
              sendAutoText: true
            }]
          }
        })
        .select()
        .single();
      
      if (tenantError) {
        console.error('Error creating tenant:', tenantError);
        throw tenantError;
      }
      
      tenant = newTenant;
      console.log('✅ Test tenant created');
    }
    
    // 2. Check/Create CRM integration
    console.log('\n📍 Setting up CRM integration...');
    const { data: existingCRM } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .eq('crm_type', 'fub')
      .single();
    
    if (existingCRM) {
      console.log('✅ CRM integration exists');
      
      // Update with latest credentials
      const { error: updateError } = await supabase
        .from('crm_integrations')
        .update({
          api_credentials: {
            api_key: process.env.DEMO_FUB_API_KEY,
            x_system: process.env.DEMO_FUB_X_SYSTEM,
            x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY,
            user_id: process.env.FUB_USER_ID_FOR_AI || '1'
          },
          is_active: true,
          updated_at: new Date()
        })
        .eq('id', existingCRM.id);
      
      if (updateError) {
        console.error('Error updating CRM:', updateError);
      } else {
        console.log('✅ CRM credentials updated');
      }
    } else {
      console.log('Creating CRM integration...');
      const { data: newCRM, error: crmError } = await supabase
        .from('crm_integrations')
        .insert({
          tenant_id: tenantUuid,
          crm_type: 'fub',
          is_active: true,
          is_primary: true,
          api_credentials: {
            api_key: process.env.DEMO_FUB_API_KEY,
            x_system: process.env.DEMO_FUB_X_SYSTEM,
            x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY,
            user_id: process.env.FUB_USER_ID_FOR_AI || '1'
          },
          sync_config: {
            sync_interval_minutes: 15,
            sync_enabled: true,
            sync_direction: 'bidirectional',
            field_mappings: {}
          }
        })
        .select()
        .single();
      
      if (crmError) {
        console.error('Error creating CRM integration:', crmError);
        throw crmError;
      }
      
      console.log('✅ CRM integration created');
    }
    
    // 3. Create auto-text rule for AIM_ASSIST
    console.log('\n📍 Setting up auto-text rule...');
    const { data: existingRule } = await supabase
      .from('auto_text_rules')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .eq('name', 'AIM_ASSIST Auto Outreach')
      .single();
    
    if (existingRule) {
      console.log('✅ Auto-text rule exists');
    } else {
      console.log('Creating auto-text rule...');
      const { data: newRule, error: ruleError } = await supabase
        .from('auto_text_rules')
        .insert({
          tenant_id: tenantUuid,
          name: 'AIM_ASSIST Auto Outreach',
          description: 'Automatically text leads tagged with AIM_ASSIST',
          is_active: true,
          priority: 1,
          trigger_type: 'tag_added',
          trigger_conditions: {
            enable_ai: true,
            required_tags: ['AIM_ASSIST']
          },
          delay_minutes: 1,
          send_window_start: '09:00:00',
          send_window_end: '20:00:00',
          timezone: 'America/New_York',
          lead_tags: ['AIM_ASSIST'],
          excluded_tags: ['DO_NOT_TEXT', 'VIP', 'MANUAL_ONLY', 'TEST'],
          message_template: 'Hi {firstName}! I saw you were interested in learning more about available properties in the area. I\'m here to help you find exactly what you\'re looking for. What specific features are most important to you in your next home?',
          max_sends_per_lead: 1,
          max_sends_per_day: 100,
          stop_on_response: true
        })
        .select()
        .single();
      
      if (ruleError) {
        console.error('Error creating rule:', ruleError);
        throw ruleError;
      }
      
      console.log('✅ Auto-text rule created');
    }
    
    // 4. Initialize queue configuration
    console.log('\n📍 Setting up queue configuration...');
    const { data: existingQueue } = await supabase
      .from('queue_configs')
      .select('*')
      .eq('name', 'tag-poll')
      .single();
    
    if (existingQueue) {
      console.log('✅ Queue config exists');
    } else {
      console.log('Creating queue config...');
      const { error: queueError } = await supabase
        .from('queue_configs')
        .insert({
          name: 'tag-poll',
          processor: 'tagPollProcessor',
          concurrency: 2,
          default_options: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 50
          },
          is_active: true
        });
      
      if (queueError && queueError.code !== '23505') { // Ignore duplicate key error
        console.error('Error creating queue config:', queueError);
      } else {
        console.log('✅ Queue config created');
      }
    }
    
    console.log('\n✨ Setup complete!');
    console.log('\n📋 Test Tenant Details:');
    console.log(`   ID: ${tenantUuid}`);
    console.log(`   Name: Demo Tenant`);
    console.log(`   CRM: Follow Up Boss`);
    console.log(`   Organization: ${tenant?.organization_id || 'Not set'}`);
    
    console.log('\n🔑 Use this tenant ID for testing:');
    console.log(`   export TEST_TENANT_ID="${tenantUuid}"`);
    
    return tenantUuid;
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup
setupTestTenant().then(tenantId => {
  console.log('\n✅ Ready to test tag polling!');
  console.log('\nNext steps:');
  console.log('1. Update test scripts to use tenant ID:', tenantId);
  console.log('2. Run: node test-tag-polling-flow.js');
  console.log('3. Or manually poll: curl -X POST http://localhost:3001/api/tag-poll/AIM_ASSIST');
  process.exit(0);
}).catch(console.error);