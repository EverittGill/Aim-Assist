// Test script for verifying queue system is working
require('dotenv').config();
const { initializeQueues, queues, getQueueStats } = require('./config/queues');

async function testQueueSystem() {
  console.log('=== Testing Queue System ===\n');
  
  try {
    // Initialize queues
    await initializeQueues();
    console.log('✅ Queues initialized successfully\n');
    
    // Test 1: Add a test SMS job
    console.log('Test 1: Adding SMS job to queue...');
    const smsJob = await queues.smsQueue.add('send-sms', {
      to: '+14045551234', // Fake number
      message: 'Test message from queue system',
      leadId: 'test-lead-123',
      direction: 'outbound',
      priority: 1
    }, {
      priority: 1,
      delay: 5000 // 5 second delay
    });
    console.log(`✅ SMS job added successfully. Job ID: ${smsJob.id}`);
    console.log(`   Job will execute in 5 seconds...\n`);
    
    // Test 2: Add a lead processing job
    console.log('Test 2: Adding lead processing job...');
    const leadJob = await queues.leadQueue.add('process-lead', {
      lead: {
        id: 'test-lead-456',
        name: 'Test Lead',
        phone: '+14045556789'
      },
      agencyName: 'Test Agency',
      appDomain: 'http://localhost:3000'
    });
    console.log(`✅ Lead job added successfully. Job ID: ${leadJob.id}\n`);
    
    // Test 3: Check queue stats
    console.log('Test 3: Checking queue statistics...');
    const smsStats = await getQueueStats(queues.smsQueue);
    const leadStats = await getQueueStats(queues.leadQueue);
    
    console.log('SMS Queue Stats:', JSON.stringify(smsStats, null, 2));
    console.log('Lead Queue Stats:', JSON.stringify(leadStats, null, 2));
    
    // Test 4: Monitor job completion
    console.log('\nTest 4: Monitoring job events...');
    
    queues.smsQueue.on('completed', (job, result) => {
      console.log(`✅ SMS Job ${job.id} completed:`, result);
    });
    
    queues.smsQueue.on('failed', (job, err) => {
      console.log(`❌ SMS Job ${job.id} failed:`, err.message);
    });
    
    queues.leadQueue.on('completed', (job, result) => {
      console.log(`✅ Lead Job ${job.id} completed:`, result);
    });
    
    queues.leadQueue.on('failed', (job, err) => {
      console.log(`❌ Lead Job ${job.id} failed:`, err.message);
    });
    
    // Test 5: Clean old jobs
    console.log('\nTest 5: Testing job cleanup...');
    const smsRemoved = await queues.smsQueue.clean(0, 'completed');
    const leadRemoved = await queues.leadQueue.clean(0, 'completed');
    console.log(`Cleaned ${smsRemoved.length} completed SMS jobs`);
    console.log(`Cleaned ${leadRemoved.length} completed lead jobs`);
    
    console.log('\n=== Queue System Tests Complete ===');
    console.log('Note: Jobs will fail because services aren\'t initialized in this test.');
    console.log('This is expected - we\'re just testing the queue infrastructure.\n');
    
    // Keep script running for 10 seconds to see job processing
    console.log('Waiting 10 seconds to observe job processing...');
    setTimeout(async () => {
      console.log('\nFinal queue stats:');
      const finalSmsStats = await getQueueStats(queues.smsQueue);
      const finalLeadStats = await getQueueStats(queues.leadQueue);
      console.log('SMS Queue:', JSON.stringify(finalSmsStats, null, 2));
      console.log('Lead Queue:', JSON.stringify(finalLeadStats, null, 2));
      
      await queues.smsQueue.close();
      await queues.leadQueue.close();
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Queue test failed:', error);
    process.exit(1);
  }
}

// Run the test
testQueueSystem();