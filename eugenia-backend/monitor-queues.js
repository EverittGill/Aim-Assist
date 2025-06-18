// Simple script to monitor queue stats via the API endpoint
const http = require('http');

const QUEUE_STATS_URL = 'http://localhost:3001/api/queues/stats';
const REFRESH_INTERVAL = 2000; // 2 seconds

function fetchQueueStats() {
  http.get(QUEUE_STATS_URL, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const stats = JSON.parse(data);
        
        // Clear console and display stats
        console.clear();
        console.log('=== Eugenia Queue Monitor ===');
        console.log(`Last Updated: ${new Date().toLocaleTimeString()}\n`);
        
        if (stats.message) {
          console.log(stats.message);
        } else {
          console.log('SMS Queue:');
          console.log(`  Waiting: ${stats.sms.waiting}`);
          console.log(`  Active: ${stats.sms.active}`);
          console.log(`  Completed: ${stats.sms.completed}`);
          console.log(`  Failed: ${stats.sms.failed}`);
          console.log(`  Delayed: ${stats.sms.delayed}`);
          
          console.log('\nLead Queue:');
          console.log(`  Waiting: ${stats.leads.waiting}`);
          console.log(`  Active: ${stats.leads.active}`);
          console.log(`  Completed: ${stats.leads.completed}`);
          console.log(`  Failed: ${stats.leads.failed}`);
          console.log(`  Delayed: ${stats.leads.delayed}`);
        }
        
        console.log('\nPress Ctrl+C to exit');
      } catch (error) {
        console.error('Failed to parse stats:', error.message);
      }
    });
  }).on('error', (err) => {
    console.clear();
    console.log('=== Eugenia Queue Monitor ===');
    console.log(`Error: ${err.message}`);
    console.log('\nMake sure the backend server is running on port 3001');
    console.log('Press Ctrl+C to exit');
  });
}

// Initial fetch
fetchQueueStats();

// Refresh every 2 seconds
setInterval(fetchQueueStats, REFRESH_INTERVAL);

console.log('Starting queue monitor...');