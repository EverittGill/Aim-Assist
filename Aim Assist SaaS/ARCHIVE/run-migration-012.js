#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Running migration to create tag_polling_configs table...\n');
  
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'migrations', '012_tag_polling_configs.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      // Use raw SQL execution through Supabase
      const { error } = await supabase.rpc('exec_sql', {
        query: statement + ';'
      }).single();
      
      if (error) {
        // Try direct execution as fallback
        console.log('RPC failed, trying direct execution...');
        // For CREATE TABLE and INSERT, we'll handle them differently
        
        if (statement.includes('CREATE TABLE')) {
          console.log('⚠️  Table creation needs to be run in Supabase SQL Editor');
        } else if (statement.includes('INSERT INTO tag_polling_configs')) {
          // We can handle the insert directly
          const { error: insertError } = await supabase
            .from('tag_polling_configs')
            .upsert({
              organization_id: '655cd229-b2e9-4737-843b-7488fe9d33e6',
              tag_name: 'AIM_ASSIST',
              interval_minutes: 5,
              process_immediately: true,
              enable_ai: true,
              send_auto_text: true,  // Enable auto-text!
              business_hours_only: false,
              is_active: true
            }, {
              onConflict: 'organization_id,tag_name'
            });
          
          if (insertError && insertError.code !== '42P01') { // Ignore table not exists error
            console.error('Insert error:', insertError);
          } else {
            console.log('✅ Configuration inserted/updated');
          }
        }
      } else {
        console.log('✅ Success');
      }
    }
    
    // Verify the configuration was created
    const { data: config, error: fetchError } = await supabase
      .from('tag_polling_configs')
      .select('*')
      .eq('organization_id', '655cd229-b2e9-4737-843b-7488fe9d33e6')
      .eq('tag_name', 'AIM_ASSIST')
      .single();
    
    if (!fetchError && config) {
      console.log('\n✅ Tag polling configuration verified:');
      console.log('  - send_auto_text:', config.send_auto_text);
      console.log('  - enable_ai:', config.enable_ai);
      console.log('  - interval_minutes:', config.interval_minutes);
      console.log('  - is_active:', config.is_active);
      
      if (config.send_auto_text) {
        console.log('\n🎉 Auto-text is ENABLED! New AIM_ASSIST leads will receive messages.');
      }
    } else {
      console.log('\n⚠️  Could not verify configuration. You may need to run the migration in Supabase SQL Editor.');
      console.log('\nCopy and paste this SQL into Supabase SQL Editor:\n');
      console.log(fs.readFileSync(sqlFile, 'utf8'));
    }
    
  } catch (error) {
    console.error('Error running migration:', error.message);
    console.log('\n⚠️  Please run the migration manually in Supabase SQL Editor.');
  }
}

runMigration();