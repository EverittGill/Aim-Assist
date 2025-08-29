/**
 * Simple phone setup - directly insert into database
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function setupPhone() {
  const tenantId = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
  const twilioPhone = '+18662981158';
  
  console.log('📱 Setting up phone mapping...\n');
  
  try {
    // First check if it already exists
    const { data: existing, error: checkError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('phone_number', twilioPhone)
      .single();
    
    if (existing && !checkError) {
      console.log('Phone already exists:', existing);
      
      // Update to ensure it's active and assigned to correct tenant
      const { error: updateError } = await supabase
        .from('phone_numbers')
        .update({
          tenant_id: tenantId,
          is_primary: true,
          is_active: true
        })
        .eq('phone_number', twilioPhone);
      
      if (updateError) {
        console.error('Update error:', updateError);
      } else {
        console.log('✅ Phone updated successfully');
      }
    } else {
      // Insert new phone (without friendly_name since column doesn't exist)
      const { data: inserted, error: insertError } = await supabase
        .from('phone_numbers')
        .insert({
          tenant_id: tenantId,
          phone_number: twilioPhone,
          is_primary: true,
          is_active: true,
          capabilities: { sms: true, mms: true, voice: false }
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        console.log('✅ Phone inserted successfully:', inserted);
      }
    }
    
    // Test the lookup
    console.log('\n🔍 Testing lookup...');
    const { data: lookup, error: lookupError } = await supabase
      .from('phone_numbers')
      .select('tenant_id')
      .eq('phone_number', twilioPhone)
      .eq('is_active', true)
      .single();
    
    if (lookup && !lookupError) {
      console.log('✅ Phone maps to tenant:', lookup.tenant_id);
      console.log('✅ Match:', lookup.tenant_id === tenantId ? 'YES' : 'NO');
    } else {
      console.error('Lookup error:', lookupError);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

setupPhone();