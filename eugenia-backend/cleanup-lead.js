#!/usr/bin/env node

// Complete cleanup script for a lead - clears conversation history and resets status
require('dotenv').config();
const FUBService = require('./services/fubService');

// Get lead ID from command line argument or use default
const LEAD_ID = process.argv[2] || '470'; // Default to Test Everitt

async function cleanupLead() {
  try {
    console.log(`🧹 Starting complete cleanup for lead ${LEAD_ID}...`);
    console.log('━'.repeat(50));
    
    // Initialize FUB service
    const fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY
    );
    
    // Step 1: Clear conversation history
    console.log('\n📝 Step 1: Clearing conversation history...');
    
    const emptyStorage = {
      conversations: [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        messageCount: 0
      }
    };
    
    const notesContent = `[EUGENIA_MESSAGES_START]${JSON.stringify(emptyStorage)}[EUGENIA_MESSAGES_END]`;
    
    // Step 2: Reset custom fields
    console.log('🔄 Step 2: Resetting custom fields...');
    
    const updateData = {
      // Clear conversation history
      background: notesContent,
      
      // Reset Eugenia talking status to active
      [process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus']: 'active',
      
      // Clear conversation link
      [process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME || 'customAimAssist']: ''
    };
    
    console.log('   Updating:', Object.keys(updateData).join(', '));
    
    // Step 3: Apply updates
    console.log('💾 Step 3: Applying updates to FUB...');
    
    const response = await fubService.updateLead(LEAD_ID, updateData);
    
    if (response) {
      console.log('\n✅ Lead cleanup completed successfully!');
      console.log('━'.repeat(50));
      console.log('📊 Summary:');
      console.log(`   • Lead ID: ${LEAD_ID}`);
      console.log('   • Conversation history: Cleared (0 messages)');
      console.log('   • Eugenia status: Active');
      console.log('   • Conversation link: Cleared');
      console.log('━'.repeat(50));
      console.log('\n🎉 Lead is ready for fresh conversation!');
    } else {
      console.log('❌ Failed to cleanup lead');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Show usage if --help is passed
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node cleanup-lead.js [leadId]');
  console.log('Example: node cleanup-lead.js 470');
  console.log('If no leadId is provided, defaults to 470 (Test Everitt)');
  process.exit(0);
}

// Run the cleanup
cleanupLead();