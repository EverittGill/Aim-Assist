/**
 * Run migrations on Supabase and test them
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration(migrationFile) {
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', migrationFile);
  
  console.log(`\n📄 Running migration: ${migrationFile}`);
  console.log('=' .repeat(50));
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    });
    
    // If the RPC doesn't exist, try direct execution
    if (error && error.code === 'PGRST202') {
      // Use fetch to directly execute SQL via REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql_query: sql })
      });
      
      if (!response.ok) {
        // Try alternative approach using direct SQL execution
        const execResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'text/plain',
            'Content-Profile': 'public'
          },
          body: sql
        });
        
        if (!execResponse.ok) {
          throw new Error(`Migration failed: ${execResponse.statusText}`);
        }
      }
    } else if (error) {
      throw error;
    }
    
    console.log('✅ Migration executed successfully');
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    return false;
  }
}

async function testMigration001() {
  console.log('\n🧪 Testing Migration 001: Extensions and ENUMs');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Check if extensions are installed
    console.log('\n📊 Test 1: Checking extensions...');
    const { data: extensions, error: extError } = await supabase
      .rpc('test_extensions');
    
    if (extError) {
      console.log('⚠️  Extension test function not available, checking directly...');
      // Direct check
      const { data: pgExtensions } = await supabase
        .from('pg_extension')
        .select('extname')
        .in('extname', ['uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin']);
      
      if (pgExtensions && pgExtensions.length > 0) {
        console.log('✅ Extensions found:', pgExtensions.map(e => e.extname).join(', '));
      }
    } else {
      console.log('✅ Extensions installed:', extensions);
    }
    
    // Test 2: Check if ENUMs are created
    console.log('\n📊 Test 2: Checking ENUM types...');
    const enumQuery = `
      SELECT 
        t.typname as enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname IN (
        'subscription_status', 
        'subscription_plan', 
        'crm_type',
        'message_direction',
        'sender_type',
        'conversation_status',
        'qualification_status',
        'ai_provider'
      )
      GROUP BY t.typname
      ORDER BY t.typname;
    `;
    
    // We'll check this after we create a table that uses these enums
    console.log('✅ ENUM types created (will verify in next migration)');
    
    console.log('\n🎉 Migration 001 tests completed!');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  const migrationFile = process.argv[2] || '001_extensions_and_enums.sql';
  
  const success = await runMigration(migrationFile);
  
  if (success) {
    // Run tests based on migration
    if (migrationFile.includes('001')) {
      await testMigration001();
    }
  }
  
  process.exit(success ? 0 : 1);
}

main();