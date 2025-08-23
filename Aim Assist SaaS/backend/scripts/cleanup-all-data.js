/**
 * Complete Data Cleanup Script
 * Removes ALL test data from Supabase tables
 * WARNING: This will delete ALL data - use with caution!
 * DOES NOT touch any FUB data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

// Create Supabase admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function cleanupAllData() {
  console.log('🧹 Starting COMPLETE data cleanup...\n');
  console.log('⚠️  WARNING: This will delete ALL data from Supabase!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  const tables = [
    'ai_conversations',
    'ai_responses',
    'campaign_metrics',
    'crm_sync_logs',
    'lead_campaigns',
    'lead_engagements',
    'lead_qualification_responses',
    'leads',
    'nurturing_campaigns',
    'phone_numbers',
    'sms_messages',
    'tenant_ai_settings',
    'tenant_billing',
    'tenant_phone_numbers',
    'crm_integrations',
    'tenants',
    'usage_metrics'
  ];

  let totalDeleted = 0;

  for (const table of tables) {
    try {
      console.log(`\n📋 Cleaning table: ${table}`);
      
      // First, count how many records exist
      const { count, error: countError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        console.log(`  ⚠️  Table doesn't exist or error: ${countError.message}`);
        continue;
      }

      if (count === 0) {
        console.log(`  ✓ Table already empty`);
        continue;
      }

      // Delete all records
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .gte('created_at', '1900-01-01'); // Delete everything
      
      if (deleteError) {
        console.log(`  ❌ Error deleting: ${deleteError.message}`);
      } else {
        console.log(`  ✅ Deleted ${count} record(s)`);
        totalDeleted += count;
      }
    } catch (error) {
      console.log(`  ❌ Unexpected error: ${error.message}`);
    }
  }

  // Also clean up auth users
  console.log('\n🔐 Cleaning auth users...');
  try {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.log(`  ❌ Error listing users: ${listError.message}`);
    } else if (users.length === 0) {
      console.log('  ✓ No auth users to delete');
    } else {
      for (const user of users) {
        const { error } = await supabase.auth.admin.deleteUser(user.id);
        if (error) {
          console.log(`  ❌ Failed to delete ${user.email}: ${error.message}`);
        } else {
          console.log(`  ✅ Deleted ${user.email}`);
        }
      }
    }
  } catch (error) {
    console.log(`  ❌ Unexpected error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✨ Cleanup complete! Deleted ${totalDeleted} database records.`);
  console.log('📝 Note: FUB data was NOT touched - manage that manually for safety.');
  console.log('🚀 You can now start fresh with new account creation and CRM imports!');
}

// Run cleanup
cleanupAllData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });