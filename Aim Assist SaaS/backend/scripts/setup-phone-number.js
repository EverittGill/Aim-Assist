/**
 * Script to set up phone number mapping for tenant
 * Maps Twilio phone number to tenant in database
 */

// Load environment variables first
require('dotenv').config({ path: __dirname + '/../.env' });

const { supabase } = require('../src/config/supabase');

async function setupPhoneNumber() {
  const tenantId = 'e5669fe6-a161-4628-89e3-4b8e01f663b8'; // Your tenant ID
  const phoneNumber = '+18662981158'; // Your Twilio number
  
  console.log('📱 Setting up phone number mapping for tenant:', tenantId);
  
  try {
    // First check if mapping already exists
    const { data: existing, error: checkError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (existing && !checkError) {
      console.log('✅ Phone number mapping already exists:', existing);
      return existing;
    }
    
    // Create new phone number mapping
    const { data, error } = await supabase
      .from('phone_numbers')
      .insert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        provider: 'twilio',
        type: 'toll_free',
        capabilities: {
          sms: true,
          mms: true,
          voice: true
        },
        is_primary: true,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error creating phone number mapping:', error);
      throw error;
    }
    
    console.log('✅ Phone number mapping created successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to setup phone number:', error);
    process.exit(1);
  }
}

// Run the setup
setupPhoneNumber().then(() => {
  console.log('🎉 Phone number setup complete!');
  process.exit(0);
});