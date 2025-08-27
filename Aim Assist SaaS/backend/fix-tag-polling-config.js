#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';

async function fixTagPollingConfig() {
  console.log('Updating AIM_ASSIST tag polling config to enable auto-text...\n');
  
  try {
    // Check current config
    const { data: currentConfig, error: fetchError } = await supabase
      .from('tag_polling_configs')
      .select('*')
      .eq('organization_id', TENANT_ID)
      .eq('tag_name', 'AIM_ASSIST')
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching config:', fetchError);
      return;
    }
    
    if (currentConfig) {
      console.log('Current config:');
      console.log('  - send_auto_text:', currentConfig.send_auto_text);
      console.log('  - enable_ai:', currentConfig.enable_ai);
      console.log('  - interval_minutes:', currentConfig.interval_minutes);
      
      // Update to enable auto-text
      const { error: updateError } = await supabase
        .from('tag_polling_configs')
        .update({
          send_auto_text: true,
          enable_ai: true,
          updated_at: new Date()
        })
        .eq('organization_id', TENANT_ID)
        .eq('tag_name', 'AIM_ASSIST');
      
      if (updateError) {
        console.error('Error updating config:', updateError);
        return;
      }
      
      console.log('\n✅ Config updated! Auto-text is now ENABLED');
      console.log('The next poll will send auto-texts to new AIM_ASSIST leads');
      
    } else {
      // Create new config
      const { error: insertError } = await supabase
        .from('tag_polling_configs')
        .insert({
          organization_id: TENANT_ID,
          tag_name: 'AIM_ASSIST',
          interval_minutes: 5,
          process_immediately: true,
          enable_ai: true,
          send_auto_text: true,  // Enable auto-text!
          business_hours_only: false,
          is_active: true
        });
      
      if (insertError) {
        console.error('Error creating config:', insertError);
        return;
      }
      
      console.log('✅ Created new config with auto-text ENABLED');
    }
    
    console.log('\n⚠️  IMPORTANT: Restart the server for the change to take effect!');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

fixTagPollingConfig();