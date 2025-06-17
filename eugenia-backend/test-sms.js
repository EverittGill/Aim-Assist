require('dotenv').config();
const TwilioService = require('./services/twilioService');

async function testSMS() {
  try {
    const twilioService = new TwilioService(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      process.env.TWILIO_FROM_NUMBER
    );
    
    // Test Everitt's phone number
    const testPhoneNumber = '+17068184445';
    const testMessage = 'Hi Test Everitt! This is Eugenia from Your Awesome Realty. Just testing our new system. Reply to this message to test the webhook!';
    
    console.log('Sending test SMS...');
    console.log('To:', testPhoneNumber);
    console.log('Message:', testMessage);
    
    const result = await twilioService.sendSMS(testPhoneNumber, testMessage);
    
    console.log('\n✅ SMS sent successfully!');
    console.log('Message SID:', result.messageSid);
    console.log('Status:', result.status);
    
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
  }
}

testSMS();