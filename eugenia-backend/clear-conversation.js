// Script to clear conversation history for a specific lead
require('dotenv').config();
const FUBService = require('./services/fubService');

const LEAD_ID = '470'; // Test Everitt

async function clearConversationHistory() {
  try {
    console.log(`🧹 Clearing conversation history for lead ${LEAD_ID}...`);
    
    // Initialize FUB service
    const fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY
    );
    
    // Clear the notes field by setting it to empty storage structure
    const emptyStorage = {
      conversations: [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        messageCount: 0
      }
    };
    
    const notesContent = `[EUGENIA_MESSAGES_START]${JSON.stringify(emptyStorage)}[EUGENIA_MESSAGES_END]`;
    
    // Update the lead's background field (which is FUB's notes field)
    const updateData = {
      background: notesContent
    };
    
    const response = await fubService.updateLead(LEAD_ID, updateData);
    
    if (response) {
      console.log('✅ Conversation history cleared successfully!');
      console.log('   Lead ID:', LEAD_ID);
      console.log('   New message count: 0');
    } else {
      console.log('❌ Failed to clear conversation history');
    }
    
  } catch (error) {
    console.error('❌ Error clearing conversation history:', error.message);
  }
}

// Run the script
clearConversationHistory();