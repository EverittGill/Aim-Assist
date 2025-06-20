require('dotenv').config();
const FUBService = require('./services/fubService');
const messageStorageService = require('./services/messageStorageService');
const ConversationService = require('./services/conversationService');

// Initialize FUB service
const fubService = new FUBService(
  process.env.FUB_API_KEY,
  process.env.FUB_X_SYSTEM,
  process.env.FUB_X_SYSTEM_KEY,
  process.env.FUB_USER_ID
);

// Initialize conversation service
const conversationService = new ConversationService(fubService);

// Test lead ID - using Test Everitt as required
const TEST_LEAD_ID = '470';

async function testNotesStorage() {
  console.log('🧪 Testing FUB Notes-based Message Storage\n');
  
  try {
    // Step 1: Get current lead data and check existing notes
    console.log('1️⃣ Fetching lead data...');
    const lead = await fubService.getLeadById(TEST_LEAD_ID);
    console.log(`   Lead: ${lead.name} (ID: ${lead.id})`);
    console.log(`   Current notes length: ${(lead.background || '').length} chars`);
    
    // Step 2: Parse existing messages from notes
    console.log('\n2️⃣ Parsing existing messages from notes...');
    const existingStorage = await fubService.getLeadMessageStorage(TEST_LEAD_ID);
    console.log(`   Found ${existingStorage.conversations?.length || 0} existing messages`);
    console.log(`   Storage version: ${existingStorage.metadata?.version || 'N/A'}`);
    
    // Step 3: Add test messages
    console.log('\n3️⃣ Adding test messages...');
    
    // Add inbound message
    const inboundMessage = {
      direction: 'inbound',
      type: 'sms',
      content: 'Hi, I\'m interested in seeing some properties in the area.',
      twilioSid: 'SM' + Math.random().toString(36).substr(2, 32),
      timestamp: new Date().toISOString()
    };
    
    const updateResult1 = await fubService.addMessageToLeadStorage(TEST_LEAD_ID, inboundMessage);
    console.log('   ✅ Added inbound message');
    console.log('   Update result:', updateResult1 ? 'Success' : 'Failed');
    
    // Add outbound AI message
    const outboundMessage = {
      direction: 'outbound',
      type: 'ai',
      content: 'Hi! I\'d be happy to help you find properties. What area are you looking in?',
      twilioSid: 'SM' + Math.random().toString(36).substr(2, 32),
      timestamp: new Date(Date.now() + 60000).toISOString() // 1 minute later
    };
    
    const updateResult2 = await fubService.addMessageToLeadStorage(TEST_LEAD_ID, outboundMessage);
    console.log('   ✅ Added outbound message');
    console.log('   Update result:', updateResult2 ? 'Success' : 'Failed');
    
    // Wait a moment for FUB to process
    console.log('\n   Waiting 2 seconds for FUB to process updates...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Fetch messages using conversation service
    console.log('\n4️⃣ Fetching messages via conversation service...');
    const messages = await conversationService.fetchFullConversationHistory(TEST_LEAD_ID, lead.name);
    console.log(`   Retrieved ${messages.length} messages`);
    
    // Display recent messages
    console.log('\n   Recent messages:');
    messages.slice(0, 5).forEach(msg => {
      const time = new Date(msg.created).toLocaleString();
      const preview = msg.body.substring(0, 50) + (msg.body.length > 50 ? '...' : '');
      console.log(`   [${time}] ${msg.sender}: ${preview}`);
    });
    
    // Step 5: Check storage statistics
    console.log('\n5️⃣ Checking storage statistics...');
    
    // Fetch lead directly to debug
    console.log('   Fetching lead directly from FUB...');
    const directLead = await fubService.getLeadById(TEST_LEAD_ID);
    console.log(`   Direct background field length: ${(directLead.background || '').length}`);
    console.log(`   Background starts with: ${(directLead.background || '').substring(0, 50)}...`);
    
    const updatedStorage = await fubService.getLeadMessageStorage(TEST_LEAD_ID);
    const stats = messageStorageService.getStats(updatedStorage);
    
    console.log('   Storage stats:');
    console.log(`   - Message count: ${stats.messageCount}`);
    console.log(`   - Storage used: ${stats.storageUsed} bytes (${stats.percentUsed}% of limit)`);
    console.log(`   - Oldest message: ${stats.oldestMessage ? new Date(stats.oldestMessage).toLocaleString() : 'N/A'}`);
    console.log(`   - Newest message: ${stats.newestMessage ? new Date(stats.newestMessage).toLocaleString() : 'N/A'}`);
    console.log(`   - Compressed: ${stats.compressed ? 'Yes' : 'No'}`);
    
    // Step 6: Test AI context formatting
    console.log('\n6️⃣ Testing AI context formatting...');
    const recentMessages = messageStorageService.getRecentMessages(updatedStorage, 5);
    const aiContext = messageStorageService.formatForAI(recentMessages);
    console.log('   AI Context (last 5 messages):');
    console.log('   ' + aiContext.split('\n').join('\n   '));
    
    // Step 7: Verify notes preservation
    console.log('\n7️⃣ Verifying notes preservation...');
    const updatedLead = await fubService.getLeadById(TEST_LEAD_ID);
    const cleanNotes = conversationService.extractCleanNotes(updatedLead.background);
    console.log(`   Clean notes (without message storage): "${cleanNotes.substring(0, 100)}${cleanNotes.length > 100 ? '...' : ''}"`);
    
    console.log('\n✅ All tests completed successfully!');
    
    // Warning if approaching limit
    if (messageStorageService.isApproachingLimit(updatedStorage)) {
      console.log('\n⚠️  WARNING: Storage is approaching size limit!');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run the test
testNotesStorage();