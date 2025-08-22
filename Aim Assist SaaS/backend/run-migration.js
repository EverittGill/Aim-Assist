/**
 * Run migration to create missing tables
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Running migration to create missing tables...\n');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  // Read the SQL file
  const sqlPath = path.join(__dirname, 'run-missing-tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  console.log('📝 Executing SQL migration...');
  
  try {
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    }).single();
    
    if (error) {
      // If RPC doesn't exist, try a different approach
      console.log('⚠️  Direct RPC not available, executing statements individually...\n');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && !s.toLowerCase().startsWith('select'));
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const statement of statements) {
        if (!statement) continue;
        
        // Extract table name for logging
        const tableMatch = statement.match(/CREATE TABLE IF NOT EXISTS public\.(\w+)/i);
        const indexMatch = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/i);
        const policyMatch = statement.match(/CREATE POLICY (\w+)/i);
        
        const itemName = tableMatch ? `table: ${tableMatch[1]}` :
                        indexMatch ? `index: ${indexMatch[1]}` :
                        policyMatch ? `policy: ${policyMatch[1]}` :
                        'statement';
        
        // We can't execute DDL directly through Supabase client
        // So we'll check what exists and report
        if (tableMatch) {
          const tableName = tableMatch[1];
          const { error: checkError } = await supabase
            .from(tableName)
            .select('count')
            .limit(1);
          
          if (checkError && checkError.code === '42P01') {
            console.log(`❌ Table ${tableName} still needs to be created`);
            errorCount++;
          } else {
            console.log(`✅ Table ${tableName} exists`);
            successCount++;
          }
        }
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('MIGRATION CANNOT BE RUN AUTOMATICALLY');
      console.log('='.repeat(50));
      console.log('\n📋 Please run the migration manually:');
      console.log('\n1. Go to: https://supabase.com/dashboard/project/qjuajqqchqxjxntofdoz/sql');
      console.log('2. Click "New query"');
      console.log('3. Copy the contents of: run-missing-tables.sql');
      console.log('4. Paste and click "Run"');
      console.log('\n✅ The SQL file has been created and is ready to run.');
      console.log('📁 File location: backend/run-missing-tables.sql');
      
    } else {
      console.log('✅ Migration completed successfully!');
    }
    
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.log('\n📋 Please run the migration manually in Supabase SQL Editor');
    console.log('File: backend/run-missing-tables.sql');
  }
  
  // Re-check the database
  console.log('\n' + '='.repeat(50));
  console.log('Checking database after migration attempt...');
  console.log('='.repeat(50) + '\n');
  
  const tables = ['extraction_logs', 'phone_numbers', 'auto_text_rules'];
  
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('count')
      .limit(1);
    
    if (error && error.code === '42P01') {
      console.log(`❌ ${table}: Still missing`);
    } else {
      console.log(`✅ ${table}: Exists`);
    }
  }
  
  process.exit(0);
}

runMigration().catch(console.error);