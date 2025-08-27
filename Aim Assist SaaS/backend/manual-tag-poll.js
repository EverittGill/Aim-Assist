#!/usr/bin/env node
/**
 * Manually trigger tag polling to test the flow
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');
const TagPollingService = require('./src/services/TagPollingService');

async function manualTagPoll() {
  console.log('\n🔄 MANUAL TAG POLL TEST\n');
  
  try {
    // Find an organization with CRM integration
    const { data: integration } = await supabase
      .from('crm_integrations')
      .select('organization_id')
      .eq('is_active', true)
      .single();
    
    if (!integration) {
      console.error('❌ No active CRM integration found');
      process.exit(1);
    }
    
    const orgId = integration.organization_id;
    console.log(`📌 Using organization: ${orgId}`);
    
    // Create polling service
    const pollService = new TagPollingService(orgId);
    
    // Poll for AIM_ASSIST tag
    console.log('\n🏷️  Polling for AIM_ASSIST tagged leads...');
    const result = await pollService.pollForTag('AIM_ASSIST', {
      processImmediately: true,
      enableAI: true,
      sendAutoText: true,
      sinceMinutesAgo: 1440 // Last 24 hours
    });
    
    console.log('\n📊 POLL RESULTS:');
    console.log(`   - Fetched: ${result.stats.fetched} leads`);
    console.log(`   - New: ${result.stats.new} leads`);
    console.log(`   - Updated: ${result.stats.updated} leads`);
    console.log(`   - Processed: ${result.stats.processed} leads`);
    console.log(`   - Skipped: ${result.stats.skipped} leads`);
    
    if (result.stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.stats.errors.forEach(err => {
        console.log(`   - Lead ${err.lead_id}: ${err.error}`);
      });
    }
    
    if (result.leads && result.leads.length > 0) {
      console.log('\n✅ Processed leads:');
      result.leads.forEach(lead => {
        console.log(`   - ${lead.first_name} ${lead.last_name} (${lead.phone})`);
      });
    }
    
    // Check if any messages were queued
    const QueueManager = require('./src/queues/QueueManager').default;
    const stats = await QueueManager.getQueueStats();
    console.log('\n📬 Queue status after poll:');
    console.log(`   - SMS queue: ${stats.sms.waiting} waiting`);
    console.log(`   - Auto-text queue: ${stats.autoText.waiting} waiting`);
    
  } catch (error) {
    console.error('\n❌ Poll failed:', error);
    console.error(error.stack);
  }
  
  process.exit(0);
}

manualTagPoll();