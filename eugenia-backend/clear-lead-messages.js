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

// Get lead ID from command line argument
const leadId = process.argv[2];
const confirmFlag = process.argv[3];

if (!leadId) {
  console.error('Usage: node clear-lead-messages.js <leadId> [--confirm]');
  console.error('Example: node clear-lead-messages.js 470 --confirm');
  console.error('\nNote: Use --confirm to actually clear the messages');
  process.exit(1);
}

async function clearLeadMessages() {
  console.log(`🗑️  Clear Messages for Lead ID: ${leadId}\n`);
  
  try {
    // Get lead info
    const lead = await fubService.getLeadById(leadId);
    console.log(`Lead: ${lead.name}`);
    console.log(`Phone: ${lead.phones?.[0]?.value || 'No phone'}`);
    console.log(`Email: ${lead.emails?.[0]?.value || 'No email'}`);
    
    // Get current message storage
    console.log('\n📥 Current message storage:');
    const currentStorage = await fubService.getLeadMessageStorage(leadId);
    console.log(`   Messages: ${currentStorage.conversations?.length || 0}`);
    
    if (!currentStorage.conversations || currentStorage.conversations.length === 0) {
      console.log('\n✅ No messages to clear.');
      return;
    }
    
    // Show preview of messages that will be cleared
    console.log('\n📋 Messages that will be cleared:');
    currentStorage.conversations.slice(0, 5).forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleString();
      const preview = msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '');
      const sender = msg.direction === 'inbound' ? 'Lead' : 'Eugenia';
      console.log(`   [${time}] ${sender}: ${preview}`);
    });
    if (currentStorage.conversations.length > 5) {
      console.log(`   ... and ${currentStorage.conversations.length - 5} more messages`);
    }
    
    if (confirmFlag !== '--confirm') {
      console.log('\n⚠️  DRY RUN - No changes made');
      console.log('To actually clear messages, run with --confirm flag');
      return;
    }
    
    // Clear the messages
    console.log('\n🧹 Clearing messages...');
    
    // Get existing notes to preserve any non-message content
    const existingNotes = lead.background || '';
    
    // Create empty message storage
    const emptyStorage = messageStorageService.createEmptyStorage();
    
    // Update lead notes with empty message storage
    const result = await fubService.updateLeadNotes(leadId, emptyStorage, existingNotes);
    
    if (result) {
      console.log('✅ Messages cleared successfully!');
      
      // Verify the clear worked
      const verifyStorage = await fubService.getLeadMessageStorage(leadId);
      console.log('\n📊 Verification:');
      console.log(`   Messages remaining: ${verifyStorage.conversations?.length || 0}`);
    } else {
      console.log('❌ Failed to clear messages');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

// Run the function
clearLeadMessages();