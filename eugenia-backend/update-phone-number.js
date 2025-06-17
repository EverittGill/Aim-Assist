const fs = require('fs');
const path = require('path');

// This script helps you update your Twilio phone number in .env

const newPhoneNumber = process.argv[2];

if (!newPhoneNumber) {
  console.log('Usage: node update-phone-number.js +1XXXXXXXXXX');
  console.log('Example: node update-phone-number.js +14045551234');
  process.exit(1);
}

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const updatedContent = envContent.replace(
  /TWILIO_FROM_NUMBER=.*/,
  `TWILIO_FROM_NUMBER=${newPhoneNumber}`
);

fs.writeFileSync(envPath, updatedContent);

console.log(`✅ Updated TWILIO_FROM_NUMBER to ${newPhoneNumber}`);
console.log('\nNext steps:');
console.log('1. Restart your server');
console.log('2. Run: node test-ai-outreach-force.js');
console.log('\nNote: Your toll-free number will work once verified!');