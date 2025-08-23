/**
 * Cleanup Test Accounts
 * Removes test user accounts and associated data from Supabase
 * DOES NOT touch any FUB data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.log('Please add:');
  console.log('SUPABASE_URL=your_url');
  console.log('SUPABASE_SERVICE_KEY=your_service_key');
  process.exit(1);
}

// Create Supabase admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function cleanupTestAccounts() {
  console.log('🧹 Starting cleanup of test accounts...\n');

  try {
    // 1. List all auth users
    console.log('📋 Fetching all auth users...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }

    console.log(`Found ${users.length} total users\n`);

    // 2. Identify test users (you can modify these criteria)
    const testUsers = users.filter(user => {
      // Only delete users created in last 24 hours for safety
      const createdAt = new Date(user.created_at);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Check if it's a recent test account
      const isRecent = createdAt > oneDayAgo;
      
      // Check for test patterns in email
      const isTestEmail = 
        user.email?.includes('test') ||
        user.email?.includes('demo') ||
        user.email?.includes('@example.com');
      
      // For safety, only delete if BOTH recent AND looks like test
      return isRecent || isTestEmail;
    });

    if (testUsers.length === 0) {
      console.log('✅ No test accounts found to delete');
      return;
    }

    console.log(`🎯 Found ${testUsers.length} test account(s) to delete:\n`);
    testUsers.forEach(user => {
      console.log(`  - ${user.email} (created: ${new Date(user.created_at).toLocaleString()})`);
    });

    // 3. Confirm deletion
    console.log('\n⚠️  This will permanently delete these accounts and their data.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Delete associated tenant data first
    for (const user of testUsers) {
      console.log(`\n🗑️  Processing ${user.email}...`);
      
      // Delete from tenants table
      const { error: tenantError } = await supabase
        .from('tenants')
        .delete()
        .eq('supabase_user_id', user.id);
      
      if (tenantError) {
        console.log(`  ⚠️  No tenant data or error: ${tenantError.message}`);
      } else {
        console.log('  ✅ Tenant data deleted');
      }
      
      // Delete from profiles table (if exists)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);
      
      if (profileError) {
        console.log(`  ⚠️  No profile data or error: ${profileError.message}`);
      } else {
        console.log('  ✅ Profile data deleted');
      }
    }

    // 5. Delete auth users
    console.log('\n🔐 Deleting auth users...');
    for (const user of testUsers) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      
      if (error) {
        console.error(`  ❌ Failed to delete ${user.email}:`, error.message);
      } else {
        console.log(`  ✅ Deleted ${user.email}`);
      }
    }

    console.log('\n✨ Cleanup complete!');
    console.log('Note: FUB data was NOT touched - manage that manually for safety.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run cleanup
cleanupTestAccounts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });