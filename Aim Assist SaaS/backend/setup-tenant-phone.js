/**
 * Setup tenant phone number mapping
 * This assigns your Twilio number to your tenant
 */

require('dotenv').config();
const TenantPhoneService = require('./src/services/TenantPhoneService');

async function setupTenantPhone() {
  const tenantId = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1'; // Your tenant ID
  const twilioPhone = '+18662981158'; // Your Twilio number
  
  console.log('📱 Setting up tenant phone mapping...\n');
  
  try {
    // Assign the phone to your tenant
    const result = await TenantPhoneService.assignPhoneToTenant(
      twilioPhone,
      tenantId,
      {
        isPrimary: true,
        capabilities: { sms: true, mms: true, voice: false },
        twilioSid: 'PN_YOUR_TWILIO_SID' // You can get this from Twilio console
      }
    );
    
    console.log('✅ Phone assigned successfully:', result);
    
    // Test the lookup
    console.log('\n🔍 Testing phone lookup...');
    const lookupTenantId = await TenantPhoneService.getTenantFromPhone(twilioPhone);
    
    if (lookupTenantId === tenantId) {
      console.log('✅ Lookup successful! Phone correctly maps to tenant');
    } else {
      console.log('❌ Lookup failed! Got:', lookupTenantId);
    }
    
    // Show all phones for this tenant
    console.log('\n📱 All phones for tenant:');
    const allPhones = await TenantPhoneService.getTenantPhones(tenantId);
    allPhones.forEach(phone => {
      console.log(`- ${phone.phone_number} ${phone.is_primary ? '(PRIMARY)' : ''} ${phone.is_active ? '✓' : '✗'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

setupTenantPhone();