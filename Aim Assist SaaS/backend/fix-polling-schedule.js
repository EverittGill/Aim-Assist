#!/usr/bin/env node

require('dotenv').config();
const TagPollingScheduler = require('./src/services/TagPollingScheduler');
const QueueManager = require('./src/queues/QueueManager').default;

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';

async function fixPollingSchedule() {
  console.log('🔧 Fixing tag polling schedule to enable auto-text...\n');
  
  try {
    // Initialize queue system first
    await QueueManager.initialize();
    console.log('✅ Queue system initialized\n');
    // First, remove the existing job
    console.log('1️⃣  Removing old schedule with sendAutoText: false');
    const removed = await TagPollingScheduler.removeScheduledJob(
      'tag-poll', 
      `tag-poll-${TENANT_ID}-AIM_ASSIST`
    );
    
    if (removed) {
      console.log('✅ Old schedule removed');
    } else {
      console.log('⚠️  No existing schedule found (might be OK)');
    }
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Now schedule with correct configuration
    console.log('\n2️⃣  Creating new schedule with sendAutoText: true');
    
    const job = await TagPollingScheduler.scheduleTagPolling(TENANT_ID, {
      tagName: 'AIM_ASSIST',
      intervalMinutes: 5,
      processImmediately: true,
      enableAI: true,
      sendAutoText: true,  // This is the key change!
      businessHoursOnly: false
    });
    
    console.log('✅ New schedule created!');
    console.log('\n📋 Configuration:');
    console.log('  - Tag: AIM_ASSIST');
    console.log('  - Interval: Every 5 minutes');
    console.log('  - Auto-text: ENABLED ✅');
    console.log('  - AI: ENABLED ✅');
    console.log('  - Process immediately: YES');
    console.log('  - Business hours only: NO (24/7)');
    
    console.log('\n🎉 SUCCESS! The next poll (within 5 minutes) will:');
    console.log('  1. Find leads with AIM_ASSIST tag');
    console.log('  2. Send them an auto-text message');
    console.log('  3. Enable AI for responses');
    console.log('  4. Mark them as processed to avoid duplicates');
    
    // Don't need to restart server - changes take effect immediately
    console.log('\n✨ No server restart needed - changes are live!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    // Give time for logs to flush
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0);
  }
}

fixPollingSchedule();