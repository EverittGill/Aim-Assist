#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function runPhoneMigration() {
  console.log('🔄 Running phone columns migration...\n');
  
  try {
    // Read the migration SQL
    const sqlFile = path.join(__dirname, 'migrations', 'add-phone-columns.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // If RPC doesn't exist, try alternative approach
      console.log('⚠️  Cannot execute SQL directly via Supabase client');
      console.log('Please run this migration manually in your Supabase SQL editor:');
      console.log('\n' + '='.repeat(60));
      console.log(sql);
      console.log('='.repeat(60) + '\n');
      return;
    }
    
    console.log('✅ Migration executed successfully');
    
    // Verify the columns were added
    const { data: testLead, error: testError } = await supabase
      .from('leads')
      .select('id, phone, phone_secondary')
      .limit(1)
      .single();
    
    if (testError && testError.code !== 'PGRST116') {
      console.error('❌ Column verification failed:', testError);
    } else {
      console.log('✅ Phone columns verified - migration successful!');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    // Show manual instructions
    const sqlFile = path.join(__dirname, 'migrations', 'add-phone-columns.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('\n📝 Please run this migration manually in your Supabase SQL editor:');
    console.log('\n' + '='.repeat(60));
    console.log(sql);
    console.log('='.repeat(60) + '\n');
  }
}

runPhoneMigration();