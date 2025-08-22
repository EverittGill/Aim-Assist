/**
 * Find your FUB user ID
 * Run: node find-fub-user.js
 */

const axios = require('axios');
require('dotenv').config();

async function findFUBUser() {
  try {
    const apiKey = process.env.DEMO_FUB_API_KEY;
    const xSystem = process.env.DEMO_FUB_X_SYSTEM;
    const xSystemKey = process.env.DEMO_FUB_X_SYSTEM_KEY;
    
    console.log('🔍 Finding FUB users...\n');
    
    // Get users
    const response = await axios.get('https://api.followupboss.com/v1/users', {
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'X-System': xSystem,
        'X-System-Key': xSystemKey,
        'Content-Type': 'application/json'
      }
    });
    
    const users = response.data.users || [];
    
    console.log(`Found ${users.length} users:\n`);
    
    users.forEach(user => {
      console.log(`User ID: ${user.id}`);
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role || 'N/A'}`);
      console.log('---');
    });
    
    console.log('\n💡 Add this to your .env file:');
    console.log(`FUB_USER_ID=${users[0]?.id || 'YOUR_USER_ID_HERE'}`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

findFUBUser();