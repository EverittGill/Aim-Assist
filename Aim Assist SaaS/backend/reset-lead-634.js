#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';
const LEAD_ID = '634';

async function resetLead634() {
  console.log('Resetting lead 634 tag tracking...\n');
  
  try {
    // Get current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', TENANT_ID)
      .eq('fub_lead_id', LEAD_ID)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching lead:', fetchError);
      return;
    }
    
    if (!lead) {
      console.log('Lead 634 not found in database');
      return;
    }
    
    console.log('Current lead data:');
    console.log('  - Name:', lead.first_name, lead.last_name);
    console.log('  - Phone:', lead.phone);
    console.log('  - Current tag tracking:', lead.custom_data?.tag_tracking);
    
    // Reset the AIM_ASSIST tag tracking to allow auto-text
    const customData = lead.custom_data || {};
    const tagTracking = customData.tag_tracking || {};
    
    // Reset AIM_ASSIST tracking
    delete tagTracking.AIM_ASSIST;
    
    // Update lead
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        custom_data: {
          ...customData,
          tag_tracking: tagTracking,
          initial_text_sent: false  // Reset this too
        }
      })
      .eq('id', lead.id);
    
    if (updateError) {
      console.error('Error updating lead:', updateError);
      return;
    }
    
    console.log('\n✅ Lead 634 tag tracking reset!');
    console.log('The next tag poll will detect it as new and send auto-text');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

resetLead634();