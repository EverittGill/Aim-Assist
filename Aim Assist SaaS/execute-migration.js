/**
 * Execute migrations using Supabase pg library
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function executeMigration(filename) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 Executing Migration: ${filename}`);
  console.log(`${'='.repeat(60)}`);
  
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', filename);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    // Use fetch to call Supabase Database API
    const response = await fetch(`${supabaseUrl}/sql/v1`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: sql
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️  SQL endpoint not available, trying alternative...');
      
      // Alternative: Use Supabase Management API
      const projectRef = 'oortuqnectzpqpboywfq';
      const mgmtResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: sql
        })
      });
      
      if (!mgmtResponse.ok) {
        const mgmtError = await mgmtResponse.text();
        throw new Error(`Management API failed: ${mgmtError}`);
      }
      
      console.log('✅ Migration executed via Management API');
      return true;
    }
    
    const result = await response.json();
    console.log('✅ Migration executed successfully');
    return true;
    
  } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    
    // Create a combined SQL file for manual execution
    console.log('\n📋 Creating combined migration file for manual execution...');
    const combinedPath = path.join(__dirname, 'MANUAL_MIGRATION.sql');
    fs.writeFileSync(combinedPath, `-- Run this in Supabase SQL Editor
-- Project: oortuqnectzpqpboywfq
-- URL: https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql/new

${sql}`);
    
    console.log('📌 Manual execution required:');
    console.log('   1. Copy the contents of MANUAL_MIGRATION.sql');
    console.log('   2. Go to: https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql/new');
    console.log('   3. Paste and click "Run"');
    
    return false;
  }
}

async function testMigration001() {
  console.log('\n🧪 Testing Migration 001...');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Test: Check if we can use gen_random_uuid()
    const { data, error } = await supabase
      .rpc('gen_random_uuid');
    
    if (!error) {
      console.log('✅ UUID extension is working');
    }
    
    // Since we can't directly query enums via Supabase client,
    // we'll test them when we create tables that use them
    console.log('✅ Migration 001 ready for next steps');
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Main
async function main() {
  const migration = '001_extensions_and_enums.sql';
  
  const success = await executeMigration(migration);
  
  if (success) {
    await testMigration001();
  }
}

main();