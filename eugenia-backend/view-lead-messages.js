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

// Get lead ID from command line argument
const leadId = process.argv[2];

if (!leadId) {
  console.error('Usage: node view-lead-messages.js <leadId>');
  console.error('Example: node view-lead-messages.js 470');
  process.exit(1);
}

async function viewLeadMessages() {
  console.log(`📱 Viewing Messages for Lead ID: ${leadId}\n`);
  
  try {
    // Get lead info
    const lead = await fubService.getLeadById(leadId);
    console.log(`Lead: ${lead.name}`);
    console.log(`Phone: ${lead.phones?.[0]?.value || 'No phone'}`);
    console.log(`Email: ${lead.emails?.[0]?.value || 'No email'}`);
    console.log(`Stage: ${lead.stage || 'No stage'}`);
    console.log(`Tags: ${lead.tags?.join(', ') || 'No tags'}`);
    
    // Get message storage
    console.log('\n📥 Fetching stored messages...');
    const storage = await fubService.getLeadMessageStorage(leadId);
    const messages = storage.conversations || [];
    
    if (messages.length === 0) {
      console.log('\n❌ No messages found in notes storage');
      
      // Check if there are any notes at all
      if (lead.background) {
        console.log('\n📝 Raw notes content:');
        console.log(lead.background.substring(0, 500) + '...');
      }
      return;
    }
    
    // Display storage info
    const stats = messageStorageService.getStats(storage);
    console.log(`\n📊 Storage Statistics:`);
    console.log(`   Messages: ${stats.messageCount}`);
    console.log(`   Storage: ${stats.storageUsed} bytes (${stats.percentUsed}% of limit)`);
    console.log(`   Date range: ${stats.oldestMessage ? new Date(stats.oldestMessage).toLocaleDateString() : 'N/A'} to ${stats.newestMessage ? new Date(stats.newestMessage).toLocaleDateString() : 'N/A'}`);
    console.log(`   Compressed: ${stats.compressed ? 'Yes' : 'No'}`);
    
    // Display messages
    console.log(`\n💬 Conversation History (${messages.length} messages):`);
    console.log('─'.repeat(80));
    
    // Sort messages by timestamp (oldest first)
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    sortedMessages.forEach((msg, index) => {
      const time = new Date(msg.timestamp).toLocaleString();
      const sender = msg.direction === 'inbound' ? '📱 Lead' : '🤖 Eugenia';
      const type = msg.type === 'ai' ? ' (AI)' : '';
      
      console.log(`\n[${index + 1}] ${time}`);
      console.log(`${sender}${type}: ${msg.content}`);
      
      if (msg.twilioSid) {
        console.log(`   Twilio SID: ${msg.twilioSid}`);
      }
    });
    
    console.log('\n' + '─'.repeat(80));
    
    // Display any clean notes (non-message content)
    const cleanNotes = conversationService.extractCleanNotes(lead.background);
    if (cleanNotes) {
      console.log('\n📝 Additional Notes:');
      console.log(cleanNotes);
    }
    
    // Check for storage warnings
    if (messageStorageService.isApproachingLimit(storage)) {
      console.log('\n⚠️  WARNING: This lead is approaching the message storage limit!');
      console.log('   Consider implementing message archiving or compression.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

// Run the viewer
viewLeadMessages();