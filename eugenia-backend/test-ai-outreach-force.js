require('dotenv').config();
const fetch = require('node-fetch');
const AuthService = require('./services/authService');
const FUBService = require('./services/fubService');
const GeminiService = require('./services/geminiService');
const TwilioService = require('./services/twilioService');

async function forceTestOutreach() {
  try {
    console.log('🚀 Force Testing AI Outreach on Test Everitt...\n');
    
    // Initialize services
    const fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY,
      process.env.FUB_USER_ID_FOR_AI
    );
    
    const geminiService = new GeminiService(process.env.GEMINI_API_KEY);
    const twilioService = new TwilioService(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      process.env.TWILIO_FROM_NUMBER
    );
    
    const leadId = '470';
    const agencyName = process.env.USER_AGENCY_NAME || 'Your Awesome Realty';
    const appDomain = process.env.APP_DOMAIN || 'http://localhost:3000';
    
    // Get Test Everitt
    console.log('Fetching Test Everitt...');
    const lead = await fubService.getLeadById(leadId);
    
    if (!lead) {
      throw new Error('Test Everitt not found');
    }
    
    console.log(`Found: ${lead.name}`);
    
    // Extract phone number
    const phone = lead.phones?.find(p => p.isPrimary)?.value || lead.phones?.[0]?.value;
    if (!phone) {
      throw new Error('No phone number found for Test Everitt');
    }
    
    // Format phone number
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;
    console.log(`Phone: ${formattedPhone}`);
    
    // Generate AI message
    console.log('\n🤖 Generating initial AI message...');
    const aiMessage = await geminiService.generateInitialOutreach(lead, agencyName);
    console.log(`Message: "${aiMessage}"`);
    
    // Send SMS
    console.log('\n📱 Sending SMS...');
    const smsResult = await twilioService.sendSMS(formattedPhone, aiMessage);
    console.log(`✅ SMS sent! SID: ${smsResult.messageSid}`);
    
    // Log to FUB
    console.log('\n📝 Logging to FUB...');
    await fubService.logTextMessage(
      leadId,
      aiMessage,
      'outbound',
      process.env.TWILIO_FROM_NUMBER,
      formattedPhone
    );
    console.log('✅ Logged to FUB');
    
    // Update custom fields
    const conversationUrl = `${appDomain}/conversation/${leadId}`;
    
    console.log('\n🔧 Updating custom fields...');
    await fubService.updateLeadCustomField(
      leadId,
      process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME,
      'active'
    );
    await fubService.updateLeadCustomField(
      leadId,
      process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME,
      conversationUrl
    );
    console.log('✅ Custom fields updated');
    
    console.log('\n✨ Success! Test Everitt has been messaged.');
    console.log(`\n📱 Check your phone for the SMS from ${process.env.TWILIO_FROM_NUMBER}`);
    console.log(`🔗 Conversation URL: ${conversationUrl}`);
    console.log('\n💡 Next steps:');
    console.log('1. Reply to the SMS to test the webhook');
    console.log('2. Check FUB to see the message logged');
    console.log('3. Visit the conversation URL in your frontend');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

forceTestOutreach();