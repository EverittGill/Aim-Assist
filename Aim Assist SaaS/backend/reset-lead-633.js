#!/usr/bin/env node

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';
const LEAD_ID = '633';

async function resetLead633() {
  console.log('Resetting lead 633 for reprocessing...\n');
  
  try {
    // Get current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', TENANT_ID)
      .eq('fub_lead_id', LEAD_ID)
      .single();
    
    if (fetchError) {
      console.error('Error fetching lead:', fetchError);
      return;
    }
    
    if (!lead) {
      console.log('Lead not found in database');
      return;
    }
    
    console.log('Current lead data:');
    console.log('  - Name:', lead.first_name, lead.last_name);
    console.log('  - Phones:', lead.custom_data?.phones);
    console.log('  - Primary phone:', lead.custom_data?.primary_phone);
    console.log('  - Tag tracking:', lead.custom_data?.tag_tracking);
    
    // Delete the lead so it will be recreated with phone data
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', lead.id);
    
    if (deleteError) {
      console.error('Error deleting lead:', deleteError);
      return;
    }
    
    console.log('\n✅ Lead 633 deleted from database');
    console.log('The next tag poll (within 5 minutes) will recreate it with phone data');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

resetLead633();