#!/usr/bin/env node

require('dotenv').config();
const TagPollingService = require('./src/services/TagPollingService');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';

async function triggerTagPoll() {
  console.log('Manually triggering AIM_ASSIST tag poll...\n');
  
  try {
    const poller = new TagPollingService(TENANT_ID);
    
    const result = await poller.pollForTag('AIM_ASSIST', {
      processImmediately: true,
      enableAI: true,
      sendAutoText: true,
      sinceMinutesAgo: 60
    });
    
    console.log('\n✅ Tag poll completed:');
    console.log('  - Fetched:', result.stats.fetched);
    console.log('  - New:', result.stats.new);
    console.log('  - Updated:', result.stats.updated);
    console.log('  - Processed:', result.stats.processed);
    console.log('  - Skipped:', result.stats.skipped);
    
    if (result.leads && result.leads.length > 0) {
      console.log('\n📱 Processed leads:');
      result.leads.forEach(lead => {
        console.log(`  - ${lead.first_name} ${lead.last_name}`);
        console.log(`    Phone: ${lead.custom_data?.primary_phone}`);
        console.log(`    Phones array: ${JSON.stringify(lead.custom_data?.phones)}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

triggerTagPoll();