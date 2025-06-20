// Script to reset lead status and custom fields
require('dotenv').config();
const FUBService = require('./services/fubService');

const LEAD_ID = '470'; // Test Everitt

async function resetLeadStatus() {
  try {
    console.log(`🔄 Resetting status for lead ${LEAD_ID}...`);
    
    // Initialize FUB service
    const fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY
    );
    
    // Reset custom fields
    const updateData = {};
    
    // Reset Eugenia talking status to active
    const talkingStatusField = process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus';
    updateData[talkingStatusField] = 'active';
    
    // Clear conversation link (set to empty string instead of null)
    const conversationLinkField = process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME || 'customAimAssist';
    updateData[conversationLinkField] = '';
    
    console.log('📝 Updating fields:', Object.keys(updateData).join(', '));
    
    const response = await fubService.updateLead(LEAD_ID, updateData);
    
    if (response) {
      console.log('✅ Lead status reset successfully!');
      console.log('   Lead ID:', LEAD_ID);
      console.log('   Eugenia Status: active');
      console.log('   All custom fields cleared');
    } else {
      console.log('❌ Failed to reset lead status');
    }
    
  } catch (error) {
    console.error('❌ Error resetting lead status:', error.message);
  }
}

// Run the script
resetLeadStatus();