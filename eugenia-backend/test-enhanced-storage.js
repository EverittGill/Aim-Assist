require('dotenv').config();
const FUBService = require('./services/fubService');
const enhancedStorage = require('./services/messageStorageServiceEnhanced');

// Initialize services
const fubService = new FUBService(
  process.env.FUB_API_KEY,
  process.env.FUB_X_SYSTEM,
  process.env.FUB_X_SYSTEM_KEY,
  process.env.FUB_USER_ID
);

// Test lead ID
const TEST_LEAD_ID = '470';

async function testEnhancedStorage() {
  console.log('🧪 Testing Enhanced Message Storage\n');
  
  try {
    // Step 1: Create a storage with many messages
    console.log('1️⃣ Creating storage with many messages...');
    
    let storage = enhancedStorage.createEmptyStorage();
    
    // Add 100 test messages
    for (let i = 0; i < 100; i++) {
      const isInbound = i % 3 === 0; // Every 3rd message is from lead
      
      storage = enhancedStorage.addMessage(storage, {
        direction: isInbound ? 'inbound' : 'outbound',
        type: isInbound ? 'sms' : 'ai',
        content: generateTestMessage(i, isInbound),
        timestamp: new Date(Date.now() - (100 - i) * 60000).toISOString() // Messages over 100 minutes
      });
      
      if ((i + 1) % 20 === 0) {
        const stats = enhancedStorage.getStats(storage);
        console.log(`   Added ${i + 1} messages - Storage: ${stats.percentUsed}% used, ${stats.messageCount} kept`);
      }
    }
    
    // Step 2: Check final statistics
    console.log('\n2️⃣ Final storage statistics:');
    const finalStats = enhancedStorage.getStats(storage);
    console.log(`   Total messages kept: ${finalStats.messageCount}`);
    console.log(`   Full messages: ${finalStats.fullMessages}`);
    console.log(`   Compressed messages: ${finalStats.compressedMessages}`);
    console.log(`   Storage used: ${finalStats.storageUsed} bytes (${finalStats.percentUsed}%)`);
    console.log(`   Optimal limit calculated: ${finalStats.optimalLimit}`);
    console.log(`   Can add more: ${finalStats.canAddMore ? 'Yes' : 'No'}`);
    
    // Step 3: Test with actual FUB update
    console.log('\n3️⃣ Updating FUB with enhanced storage...');
    
    // First clear existing notes
    await fubService.updateLeadNotes(TEST_LEAD_ID, enhancedStorage.createEmptyStorage(), '');
    
    // Then update with our test data
    const formattedNotes = `[EUGENIA_MESSAGES_START]${JSON.stringify(storage)}[EUGENIA_MESSAGES_END]`;
    await fubService.updateLead(TEST_LEAD_ID, { background: formattedNotes });
    
    console.log('   ✅ Updated FUB successfully');
    
    // Step 4: Retrieve and verify
    console.log('\n4️⃣ Retrieving from FUB...');
    const lead = await fubService.getLeadById(TEST_LEAD_ID);
    const retrievedNotes = lead.background || '';
    
    if (retrievedNotes.includes('[EUGENIA_MESSAGES_START]')) {
      const jsonMatch = retrievedNotes.match(/\[EUGENIA_MESSAGES_START\](.*?)\[EUGENIA_MESSAGES_END\]/s);
      if (jsonMatch) {
        const retrievedStorage = JSON.parse(jsonMatch[1]);
        console.log(`   ✅ Retrieved ${retrievedStorage.conversations?.length || 0} messages from FUB`);
        
        // Show a sample of messages
        console.log('\n   Sample of stored messages:');
        const sample = retrievedStorage.conversations.slice(-5);
        sample.forEach((msg, idx) => {
          if (msg.content) {
            // Full message
            console.log(`   [${idx + 1}] ${msg.direction}: ${msg.content.substring(0, 50)}...`);
          } else if (msg.c) {
            // Compressed message
            console.log(`   [${idx + 1}] ${msg.d === 'i' ? 'inbound' : 'outbound'}: ${msg.c}...`);
          }
        });
      }
    }
    
    // Step 5: Test compression behavior
    console.log('\n5️⃣ Testing compression behavior...');
    
    // Add messages until compression kicks in
    let testStorage = enhancedStorage.createEmptyStorage();
    let compressionTriggered = false;
    
    for (let i = 0; i < 200; i++) {
      testStorage = enhancedStorage.addMessage(testStorage, {
        direction: 'inbound',
        content: 'This is a test message with some content that takes up space. ' + 
                 'We want to see when compression kicks in. Message number ' + i
      });
      
      if (testStorage.metadata.compressed && !compressionTriggered) {
        compressionTriggered = true;
        const stats = enhancedStorage.getStats(testStorage);
        console.log(`   Compression triggered at message ${i + 1}`);
        console.log(`   Storage was ${stats.percentUsed}% full`);
        console.log(`   Now keeping ${stats.messageCount} messages`);
        break;
      }
    }
    
    console.log('\n✅ Enhanced storage test completed!');
    
    console.log('\n📊 Summary of improvements:');
    console.log('   1. Dynamic message limit (50-500 based on content)');
    console.log('   2. Smart compression for older messages');
    console.log('   3. Automatic optimization based on message size');
    console.log('   4. Can store significantly more messages');
    console.log('   5. Preserves recent messages in full detail');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

function generateTestMessage(index, isInbound) {
  const leadMessages = [
    'I am interested in viewing properties',
    'My budget is around $500k',
    'Looking for 3 bedrooms',
    'Prefer Buckhead area',
    'When can we schedule a showing?',
    'Do you have anything with a pool?',
    'Need good schools nearby',
    'How is the market right now?'
  ];
  
  const aiMessages = [
    'I would be happy to help you find properties',
    'There are several options in your price range',
    'I can schedule showings this weekend',
    'The market is very active right now',
    'I have found 5 properties that match your criteria',
    'Would you prefer morning or afternoon showings?',
    'Here are some properties you might like',
    'Let me send you more details'
  ];
  
  const messages = isInbound ? leadMessages : aiMessages;
  return messages[index % messages.length] + ` (Message ${index + 1})`;
}

// Run the test
testEnhancedStorage();