require('dotenv').config();

async function testTwilio() {
  console.log('Testing Twilio Configuration...\n');
  
  // Check environment variables
  console.log('Environment Check:');
  console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing');
  console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('TWILIO_FROM_NUMBER:', process.env.TWILIO_FROM_NUMBER || '❌ Missing');
  
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
    console.error('\n❌ Missing required Twilio environment variables');
    return;
  }
  
  try {
    // Initialize Twilio client directly
    const client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    console.log('\n📱 Sending test SMS...');
    console.log('From:', process.env.TWILIO_FROM_NUMBER);
    console.log('To: +17068184445');
    console.log('Message: Test message from Eugenia - please ignore');
    
    const message = await client.messages.create({
      body: 'Test message from Eugenia - please ignore',
      from: process.env.TWILIO_FROM_NUMBER,
      to: '+17068184445'
    });
    
    console.log('\n✅ Message sent successfully!');
    console.log('Message SID:', message.sid);
    console.log('Status:', message.status);
    console.log('Date created:', message.dateCreated);
    
    // Check message status
    console.log('\nChecking message status...');
    const sentMessage = await client.messages(message.sid).fetch();
    console.log('Current status:', sentMessage.status);
    console.log('Error code:', sentMessage.errorCode || 'None');
    console.log('Error message:', sentMessage.errorMessage || 'None');
    
  } catch (error) {
    console.error('\n❌ Twilio Error:', error.message);
    console.error('Error code:', error.code);
    console.error('More info:', error.moreInfo);
    
    if (error.code === 20003) {
      console.error('\n⚠️  Authentication error - check your Twilio credentials');
    } else if (error.code === 21211) {
      console.error('\n⚠️  Invalid "To" phone number');
    } else if (error.code === 21608) {
      console.error('\n⚠️  The "From" phone number is not verified with your Twilio account');
    }
  }
}

testTwilio();