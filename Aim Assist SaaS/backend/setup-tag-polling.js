#!/usr/bin/env node

/**
 * Setup script for tag polling
 * 1. Runs the missing tables migration
 * 2. Creates AIM_ASSIST tag polling configuration
 * 3. Creates FUB CRM integration
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

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

async function runMigration() {
  console.log('📦 Running migration 009_missing_tables.sql...\n');
  
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '009_missing_tables.sql');
    const sqlContent = await fs.readFile(migrationPath, 'utf8');
    
    // Execute migration
    const { error } = await supabase.rpc('exec_sql', { 
      query: sqlContent 
    }).catch(err => {
      // If RPC doesn't exist, log the SQL for manual execution
      console.log('⚠️  Cannot execute SQL directly. Please run this in Supabase SQL editor:');
      console.log('-'.repeat(60));
      console.log(sqlContent);
      console.log('-'.repeat(60));
      return { error: 'Manual execution required' };
    });
    
    if (error) {
      console.log('⚠️  Migration needs manual execution in Supabase dashboard');
      console.log('   Go to: SQL Editor in your Supabase project');
      console.log('   Copy and run the migration from: supabase/migrations/009_missing_tables.sql');
      return false;
    }
    
    console.log('✅ Migration completed successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    return false;
  }
}

async function setupTagPolling() {
  console.log('\n🏷️  Setting up AIM_ASSIST tag polling...\n');
  
  // Get the test organization
  const TEST_ORG_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6'; // Test Real Estate Co
  
  try {
    // Check if tag_polling_configs table exists
    const { error: tableError } = await supabase
      .from('tag_polling_configs')
      .select('id')
      .limit(1);
    
    if (tableError) {
      console.log('❌ tag_polling_configs table does not exist yet');
      console.log('   Please run the migration first');
      return false;
    }
    
    // Check if AIM_ASSIST config already exists
    const { data: existing } = await supabase
      .from('tag_polling_configs')
      .select('*')
      .eq('organization_id', TEST_ORG_ID)
      .eq('tag_name', 'AIM_ASSIST')
      .single();
    
    if (existing) {
      console.log('✅ AIM_ASSIST tag polling already configured');
      console.log(`   Interval: ${existing.interval_minutes} minutes`);
      console.log(`   Active: ${existing.is_active}`);
      console.log(`   Last poll: ${existing.last_poll_time || 'Never'}`);
      return true;
    }
    
    // Create new tag polling config
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
        business_hours_only: false // Poll 24/7 for testing
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to create tag polling config:', error.message);
      return false;
    }
    
    console.log('✅ AIM_ASSIST tag polling configured successfully');
    console.log(`   ID: ${data.id}`);
    console.log(`   Organization: ${TEST_ORG_ID}`);
    console.log(`   Polling every: ${data.interval_minutes} minutes`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Setup error:', error.message);
    return false;
  }
}

async function setupCRMIntegration() {
  console.log('\n🔗 Setting up FUB CRM integration...\n');
  
  const TEST_ORG_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';
  
  try {
    // Check if crm_integrations table exists
    const { error: tableError } = await supabase
      .from('crm_integrations')
      .select('id')
      .limit(1);
    
    if (tableError) {
      console.log('❌ crm_integrations table does not exist yet');
      console.log('   Please run the migration first');
      return false;
    }
    
    // Check if integration already exists
    const { data: existing } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('organization_id', TEST_ORG_ID)
      .single();
    
    if (existing) {
      console.log('✅ CRM integration already configured');
      console.log(`   Type: ${existing.crm_type}`);
      console.log(`   Active: ${existing.is_active}`);
      return true;
    }
    
    // Create CRM integration
    const { data, error } = await supabase
      .from('crm_integrations')
      .insert({
        organization_id: TEST_ORG_ID,
        crm_type: 'fub',
        credentials: {
          api_key: process.env.DEMO_FUB_API_KEY || process.env.FUB_API_KEY,
          x_system: process.env.DEMO_FUB_X_SYSTEM || process.env.FUB_X_SYSTEM || 'Aim-Assist',
          x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY || process.env.FUB_X_SYSTEM_KEY
        },
        settings: {
          user_id: process.env.FUB_USER_ID_FOR_AI
        },
        is_active: true,
        auto_sync_enabled: true,
        sync_interval_minutes: 30
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to create CRM integration:', error.message);
      return false;
    }
    
    console.log('✅ FUB CRM integration configured successfully');
    console.log(`   ID: ${data.id}`);
    console.log(`   Type: ${data.crm_type}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Setup error:', error.message);
    return false;
  }
}

async function verifySetup() {
  console.log('\n🔍 Verifying setup...\n');
  
  // Check tables exist
  const tables = ['tag_polling_configs', 'crm_integrations', 'autotext_rules'];
  let allGood = true;
  
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('id')
      .limit(1);
    
    if (error) {
      console.log(`   ❌ ${table} - Not found`);
      allGood = false;
    } else {
      console.log(`   ✅ ${table} - Exists`);
    }
  }
  
  // Check if old tenants table is gone
  const { error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .limit(1);
  
  if (tenantError) {
    console.log('   ✅ tenants table - Removed (good!)');
  } else {
    console.log('   ⚠️  tenants table - Still exists (should be removed)');
  }
  
  return allGood;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 TAG POLLING SETUP SCRIPT');
  console.log('='.repeat(60));
  
  // Step 1: Run migration (or provide instructions)
  const migrationSuccess = await runMigration();
  
  if (!migrationSuccess) {
    console.log('\n📝 Next Steps:');
    console.log('1. Copy the migration from: supabase/migrations/009_missing_tables.sql');
    console.log('2. Go to your Supabase dashboard SQL editor');
    console.log('3. Paste and run the migration');
    console.log('4. Run this script again: node setup-tag-polling.js');
    return;
  }
  
  // Step 2: Setup configurations
  await setupTagPolling();
  await setupCRMIntegration();
  
  // Step 3: Verify everything
  const isValid = await verifySetup();
  
  console.log('\n' + '='.repeat(60));
  if (isValid) {
    console.log('✅ SETUP COMPLETE - Tag polling should start working!');
    console.log('\nTo test:');
    console.log('1. Add AIM_ASSIST tag to a lead in FUB');
    console.log('2. Wait up to 5 minutes');
    console.log('3. Check if lead appears in database');
  } else {
    console.log('⚠️  SETUP INCOMPLETE - Please run the migration in Supabase');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);