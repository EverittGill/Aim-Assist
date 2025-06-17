require('dotenv').config();
const FUBService = require('./services/fubService');

async function addTestTag() {
  try {
    const fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY,
      process.env.FUB_USER_ID_FOR_AI
    );
    
    // Update Test Everitt with a test tag
    const leadId = '470';
    const updates = {
      tags: ['Test Lead', 'Direct Connect']  // Adding Direct Connect tag
    };
    
    console.log('Adding "Direct Connect" tag to Test Everitt...');
    const result = await fubService.updateLead(leadId, updates);
    
    console.log('✅ Tag added successfully!');
    console.log('Updated tags:', result.tags);
    
  } catch (error) {
    console.error('❌ Failed to add tag:', error.message);
  }
}

addTestTag();