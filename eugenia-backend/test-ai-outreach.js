require('dotenv').config();
const fetch = require('node-fetch');
const AuthService = require('./services/authService');

async function testAIOutreach() {
  try {
    // Generate a test auth token
    const authService = new AuthService(process.env.JWT_SECRET);
    const token = authService.generateToken({ id: 'test-user', email: 'test@example.com' });
    
    console.log('🚀 Testing AI Outreach System...\n');
    console.log('This will:');
    console.log('1. Scan for leads with "Direct Connect" tag');
    console.log('2. Find Test Everitt (ID: 470)');
    console.log('3. Generate a personalized AI message');
    console.log('4. Send SMS to +17068184445');
    console.log('5. Update FUB with message and status\n');
    
    console.log('Calling /api/initiate-ai-outreach...\n');
    
    const response = await fetch('http://localhost:3001/api/initiate-ai-outreach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error (${response.status}): ${error}`);
    }
    
    const result = await response.json();
    
    console.log('\n✅ AI Outreach Complete!\n');
    console.log('Results:', JSON.stringify(result, null, 2));
    
    if (result.results && result.results.length > 0) {
      console.log('\n📱 Messages Sent:');
      result.results.forEach(r => {
        if (r.status === 'success') {
          console.log(`\n  To: ${r.leadName} (ID: ${r.leadId})`);
          console.log(`  Message: "${r.message}"`);
          console.log(`  FUB Link: ${r.conversationUrl}`);
        }
      });
    }
    
    console.log('\n\n💡 Next Steps:');
    console.log('1. Check your phone for the SMS from +18662981158');
    console.log('2. Reply to test the webhook (if ngrok is set up)');
    console.log('3. Check FUB to see the message logged');
    console.log('4. Visit the conversation URL to see it in the frontend');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure:');
    console.error('1. Backend server is running on port 3001');
    console.error('2. All services are properly configured in .env');
    console.error('3. Test Everitt has "Direct Connect" tag');
  }
}

// Run the test
testAIOutreach();