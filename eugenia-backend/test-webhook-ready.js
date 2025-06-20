// Test script to verify webhook readiness
require('dotenv').config();
const axios = require('axios');

console.log('🔍 Webhook Readiness Check\n');

// Check environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN', 
  'TWILIO_FROM_NUMBER',
  'FUB_API_KEY',
  'GEMINI_API_KEY',
  'USER_NOTIFICATION_PHONE',
  'NODE_ENV',
  'ALLOW_DEV_SMS',
  'APP_DOMAIN'
];

console.log('📋 Environment Variables:');
let allVarsSet = true;
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const displayValue = varName.includes('KEY') || varName.includes('TOKEN') 
    ? (value ? '[REDACTED]' : 'NOT SET')
    : (value || 'NOT SET');
  console.log(`  ${status} ${varName}: ${displayValue}`);
  if (!value) allVarsSet = false;
});

console.log('\n📱 Twilio Configuration:');
console.log(`  Phone Number: ${process.env.TWILIO_FROM_NUMBER || 'NOT SET'}`);
console.log(`  Agent Notification: ${process.env.USER_NOTIFICATION_PHONE || 'NOT SET'}`);
console.log(`  Development SMS: ${process.env.ALLOW_DEV_SMS === 'true' ? 'ENABLED' : 'DISABLED'}`);

console.log('\n🔗 Webhook Configuration:');
console.log(`  Endpoint: /webhook/twilio-sms`);
console.log(`  Signature Validation: ${process.env.NODE_ENV === 'development' ? 'BYPASSED (dev mode)' : 'ENABLED'}`);
console.log(`  APP_DOMAIN: ${process.env.APP_DOMAIN || 'NOT SET'}`);

console.log('\n🏗️  FUB Custom Fields:');
console.log(`  Status Field: ${process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus'}`);
console.log(`  Link Field: ${process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME || 'customAimAssist'}`);

// Test server connectivity
console.log('\n🌐 Testing Server Connectivity...');
axios.get('http://localhost:3001/api/health')
  .then(response => {
    console.log('  ✅ Backend server is running on port 3001');
    console.log(`  Response: ${JSON.stringify(response.data)}`);
  })
  .catch(error => {
    console.log('  ❌ Backend server is NOT running');
    console.log('  Start it with: cd eugenia-backend && npm start');
  })
  .finally(() => {
    console.log('\n📝 Next Steps:');
    if (!allVarsSet) {
      console.log('  1. ❗ Set missing environment variables in .env file');
    }
    console.log('  1. Start the backend server: npm start');
    console.log('  2. Start ngrok: ngrok http 3001');
    console.log('  3. Configure webhook URL in Twilio Console');
    console.log('  4. Send test SMS from +17068184445 to +18662981158');
    console.log('\n💡 See WEBHOOK_SETUP.md for detailed instructions');
  });