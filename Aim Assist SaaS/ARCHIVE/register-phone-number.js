#!/usr/bin/env node
/**
 * Register phone number to organization for webhook routing
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function registerPhoneNumber() {
  console.log('\n📞 REGISTERING PHONE NUMBER TO ORGANIZATION\n');
  
  const phoneData = {
    organization_id: '655cd229-b2e9-4737-843b-7488fe9d33e6',
    phone_number: '+18662981158',
    type: 'twilio',
    is_primary: true,
    is_active: true,
    capabilities: {
      sms: true,
      voice: false,
      mms: false
    },
    provider_config: {
      account_sid: process.env.TWILIO_ACCOUNT_SID,
      messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe9c8383c10e1336bc9845697b026e9b2'
    }
  };
  
  try {
    // Check if phone_numbers table exists
    const { data: existing } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('organization_id', phoneData.organization_id)
      .eq('phone_number', phoneData.phone_number)
      .single();
    
    if (existing) {
      console.log('✅ Phone number already registered to organization');
      console.log('   Phone:', existing.phone_number);
      console.log('   Organization:', existing.organization_id);
      console.log('   Active:', existing.is_active);
    } else {
      // Insert new phone number
      const { data, error } = await supabase
        .from('phone_numbers')
        .insert([phoneData])
        .select()
        .single();
      
      if (error) {
        if (error.message.includes('does not exist')) {
          console.log('❌ phone_numbers table does not exist');
          console.log('\nPlease create it with this SQL:\n');
          console.log(`CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  phone_number VARCHAR(50) NOT NULL,
  type VARCHAR(50) DEFAULT 'twilio',
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{"sms": true, "voice": false}'::jsonb,
  provider_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, phone_number)
);

CREATE INDEX idx_phone_numbers_org ON phone_numbers(organization_id);
CREATE INDEX idx_phone_numbers_phone ON phone_numbers(phone_number);`);
        } else {
          console.error('❌ Error registering phone:', error.message);
        }
      } else {
        console.log('✅ Phone number registered successfully!');
        console.log('   ID:', data.id);
        console.log('   Phone:', data.phone_number);
        console.log('   Organization:', data.organization_id);
      }
    }
    
    // Test the lookup
    console.log('\n🔍 Testing phone lookup...');
    const TenantPhoneService = require('./src/services/TenantPhoneService');
    const orgFromPhone = await TenantPhoneService.getTenantFromPhone('+18662981158');
    if (orgFromPhone) {
      console.log('✅ Phone lookup successful! Organization:', orgFromPhone);
    } else {
      console.log('❌ Phone lookup failed - webhook won\'t work');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

registerPhoneNumber();