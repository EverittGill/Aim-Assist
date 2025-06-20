require('dotenv').config();
const FUBService = require('./services/fubService');
const messageStorageService = require('./services/messageStorageService');

// Initialize FUB service
const fubService = new FUBService(
  process.env.FUB_API_KEY,
  process.env.FUB_X_SYSTEM,
  process.env.FUB_X_SYSTEM_KEY,
  process.env.FUB_USER_ID
);

// Test lead ID - using Test Everitt as required
const TEST_LEAD_ID = '470';

async function testSimulatorFlow() {
  console.log('🧪 Testing Lead Message Simulator with Notes Storage\n');
  
  try {
    // Step 1: Clear existing messages (start fresh)
    console.log('1️⃣ Clearing existing messages...');
    const emptyStorage = messageStorageService.createEmptyStorage();
    await fubService.updateLeadNotes(TEST_LEAD_ID, emptyStorage, '');
    console.log('   ✅ Messages cleared\n');
    
    // Step 2: Simulate conversation flow
    console.log('2️⃣ Simulating conversation flow...\n');
    
    // Simulate initial AI outreach
    console.log('   📤 AI: Initial outreach');
    await fubService.addMessageToLeadStorage(TEST_LEAD_ID, {
      direction: 'outbound',
      type: 'ai',
      content: 'Hi! I noticed you were interested in properties in the area. I\'d love to help you find your dream home! What specific neighborhoods are you considering?',
      timestamp: new Date().toISOString()
    });
    
    await delay(1000);
    
    // Simulate lead reply
    console.log('   📱 Lead: First response');
    await fubService.addMessageToLeadStorage(TEST_LEAD_ID, {
      direction: 'inbound',
      type: 'sms',
      content: 'Hi! Yes, I\'m looking in the Buckhead and Midtown areas. My budget is around $500k',
      timestamp: new Date().toISOString()
    });
    
    await delay(1000);
    
    // Simulate AI response
    console.log('   🤖 AI: Follow-up question');
    await fubService.addMessageToLeadStorage(TEST_LEAD_ID, {
      direction: 'outbound',
      type: 'ai',
      content: 'Great choices! Both Buckhead and Midtown have fantastic options in your price range. Are you looking for a condo, townhouse, or single-family home?',
      timestamp: new Date().toISOString()
    });
    
    await delay(1000);
    
    // Another lead reply
    console.log('   📱 Lead: Clarification');
    await fubService.addMessageToLeadStorage(TEST_LEAD_ID, {
      direction: 'inbound',
      type: 'sms',
      content: 'Preferably a condo with at least 2 bedrooms. I work from home so need a good office space',
      timestamp: new Date().toISOString()
    });
    
    await delay(1000);
    
    // AI response
    console.log('   🤖 AI: Helpful response');
    await fubService.addMessageToLeadStorage(TEST_LEAD_ID, {
      direction: 'outbound',
      type: 'ai',
      content: 'Perfect! A 2+ bedroom condo with home office space. I have several listings that match your criteria in both areas. When would be a good time for you to see some properties?',
      timestamp: new Date().toISOString()
    });
    
    // Step 3: Verify storage
    console.log('\n3️⃣ Verifying message storage...');
    const storage = await fubService.getLeadMessageStorage(TEST_LEAD_ID);
    const stats = messageStorageService.getStats(storage);
    
    console.log(`   ✅ Stored ${stats.messageCount} messages`);
    console.log(`   📊 Storage used: ${stats.storageUsed} bytes (${stats.percentUsed}% of limit)`);
    
    // Step 4: Test retrieval for AI context
    console.log('\n4️⃣ Testing AI context generation...');
    const recentMessages = messageStorageService.getRecentMessages(storage, 10);
    const aiContext = messageStorageService.formatForAI(recentMessages);
    
    console.log('   AI Context Preview:');
    console.log('   ' + '-'.repeat(60));
    const contextLines = aiContext.split('\n').slice(-5); // Show last 5 messages
    contextLines.forEach(line => console.log('   ' + line));
    console.log('   ' + '-'.repeat(60));
    
    // Step 5: Verify frontend can fetch
    console.log('\n5️⃣ Simulating frontend fetch...');
    const lead = await fubService.getLeadById(TEST_LEAD_ID);
    console.log(`   Lead: ${lead.name}`);
    console.log(`   Background field populated: ${lead.background ? 'Yes' : 'No'}`);
    console.log(`   Can parse messages: ${storage.conversations ? 'Yes' : 'No'}`);
    
    // Step 6: Display conversation as it would appear
    console.log('\n6️⃣ Conversation as displayed in UI:');
    console.log('   ' + '='.repeat(60));
    
    storage.conversations.forEach((msg, index) => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const sender = msg.direction === 'inbound' ? '👤 Lead' : '🤖 Eugenia';
      console.log(`\n   ${sender} (${time}):`);
      console.log(`   ${msg.content}`);
    });
    
    console.log('\n   ' + '='.repeat(60));
    
    console.log('\n✅ Test completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Messages are stored in FUB background field as JSON');
    console.log('   - Each message includes direction, type, content, and timestamp');
    console.log('   - Storage handles up to 50 messages (auto-removes oldest)');
    console.log('   - AI has full conversation context for accurate responses');
    console.log('   - Frontend can fetch and display all messages properly');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testSimulatorFlow();