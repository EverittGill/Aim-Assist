#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';
const FUB_LEAD_ID = '637'; // Everitt6 Gill Test

async function resetTestLead() {
  console.log('🔄 Resetting test lead 637 to test SMS sending...\n');
  
  try {
    // Get the current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', TENANT_ID)
      .eq('fub_lead_id', FUB_LEAD_ID)
      .single();
    
    if (fetchError) {
      console.error('Error fetching lead:', fetchError);
      return;
    }
    
    if (!lead) {
      console.log('❌ Lead not found');
      return;
    }
    
    console.log('Found lead:', lead.first_name, lead.last_name);
    console.log('Current phone:', lead.phone);
    
    // Reset the tag tracking to allow auto-text to be sent again
    const customData = lead.custom_data || {};
    const tagTracking = customData.tag_tracking || {};
    
    if (tagTracking.AIM_ASSIST) {
      console.log('\n📝 Current AIM_ASSIST tracking:');
      console.log('  - text_sent:', tagTracking.AIM_ASSIST.text_sent);
      console.log('  - processed:', tagTracking.AIM_ASSIST.processed);
      
      // Reset the flags
      tagTracking.AIM_ASSIST.text_sent = false;
      tagTracking.AIM_ASSIST.processed = false;
      delete tagTracking.AIM_ASSIST.text_sent_at;
      delete tagTracking.AIM_ASSIST.processed_at;
      
      customData.tag_tracking = tagTracking;
      
      // Update the lead
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          custom_data: customData,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);
      
      if (updateError) {
        console.error('Error updating lead:', updateError);
        return;
      }
      
      console.log('\n✅ Lead reset successfully!');
      console.log('The next poll will attempt to send auto-text to this lead.');
      console.log('\nPhone number that will receive SMS:', lead.phone);
    } else {
      console.log('⚠️  Lead does not have AIM_ASSIST tag tracking');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

resetTestLead();