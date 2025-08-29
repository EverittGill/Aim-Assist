#!/usr/bin/env node

/**
 * Check and setup missing tables for tag polling
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const TEST_ORG_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6'; // Test Real Estate Co

async function checkAndSetup() {
  console.log('🔍 Checking if tables exist...\n');
  
  // Check if tag_polling_configs exists
  const { error: tagError } = await supabase
    .from('tag_polling_configs')
    .select('id')
    .limit(1);
  
  if (tagError) {
    console.log('❌ tag_polling_configs table NOT FOUND');
    console.log('\n📝 TO FIX THIS:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Click on "SQL Editor"');
    console.log('3. Copy the contents of: supabase/migrations/009_missing_tables.sql');
    console.log('4. Paste and run it');
    console.log('5. Run this script again\n');
    return;
  }
  
  console.log('✅ tag_polling_configs table exists');
  
  // Setup AIM_ASSIST polling
  console.log('\n🏷️  Configuring AIM_ASSIST tag polling...');
  
  // Check if already exists
  const { data: existing } = await supabase
    .from('tag_polling_configs')
    .select('*')
    .eq('organization_id', TEST_ORG_ID)
    .eq('tag_name', 'AIM_ASSIST')
    .single();
  
  if (existing) {
    console.log('✅ AIM_ASSIST already configured:');
    console.log(`   - Polling every ${existing.interval_minutes} minutes`);
    console.log(`   - Active: ${existing.is_active}`);
    console.log(`   - Last poll: ${existing.last_poll_time || 'Never'}`);
  } else {
    // Create it
    const { data, error } = await supabase
      .from('tag_polling_configs')
      .insert({
        organization_id: TEST_ORG_ID,
        tag_name: 'AIM_ASSIST',
        interval_minutes: 5,
        is_active: true,
        process_immediately: true,
        enable_ai: true,
        send_auto_text: true,
        business_hours_only: false
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to create config:', error.message);
    } else {
      console.log('✅ AIM_ASSIST tag polling created successfully!');
      console.log(`   - Will poll every ${data.interval_minutes} minutes`);
    }
  }
  
  // Check CRM integration
  console.log('\n🔗 Checking CRM integration...');
  
  const { error: crmTableError } = await supabase
    .from('crm_integrations')
    .select('id')
    .limit(1);
  
  if (crmTableError) {
    console.log('❌ crm_integrations table NOT FOUND');
    console.log('   Run the migration to create it');
    return;
  }
  
  const { data: crmIntegration } = await supabase
    .from('crm_integrations')
    .select('*')
    .eq('organization_id', TEST_ORG_ID)
    .single();
  
  if (crmIntegration) {
    console.log('✅ CRM integration exists:');
    console.log(`   - Type: ${crmIntegration.crm_type}`);
    console.log(`   - Active: ${crmIntegration.is_active}`);
  } else {
    // Create FUB integration
    const { data, error } = await supabase
      .from('crm_integrations')
      .insert({
        organization_id: TEST_ORG_ID,
        crm_type: 'fub',
        credentials: {
          api_key: process.env.DEMO_FUB_API_KEY || process.env.FUB_API_KEY,
          x_system: 'Aim-Assist',
          x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY || process.env.FUB_X_SYSTEM_KEY
        },
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to create CRM integration:', error.message);
    } else {
      console.log('✅ FUB CRM integration created successfully!');
    }
  }
  
  console.log('\n✅ SETUP COMPLETE!');
  console.log('\nNEXT STEPS:');
  console.log('1. Make sure a lead in FUB has the AIM_ASSIST tag');
  console.log('2. The system will check every 5 minutes');
  console.log('3. Monitor logs to see polling activity');
}

checkAndSetup().catch(console.error);