// Test script to verify Sentry is working
require('dotenv').config();
const { Sentry } = require('./config/sentry');

console.log('Testing Sentry error tracking...\n');

if (!process.env.SENTRY_DSN) {
  console.log('❌ SENTRY_DSN not configured in .env file');
  console.log('Please add your Sentry DSN to the .env file first');
  process.exit(1);
}

console.log('✅ Sentry DSN found');
console.log('Sending test error to Sentry...\n');

// Create a test error
try {
  throw new Error('Test error from Eugenia ISA - Queue implementation complete!');
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      test: true,
      component: 'queue-system'
    },
    extra: {
      message: 'This is a test error to verify Sentry integration',
      timestamp: new Date().toISOString(),
      queueSystem: 'Bull + Redis',
      features: ['SMS Queue', 'Lead Queue', 'Error Tracking']
    }
  });
}

console.log('Error sent! Check your Sentry dashboard at https://sentry.io');
console.log('You should see the test error appear within a few seconds.');

// Give Sentry time to send
setTimeout(() => {
  process.exit(0);
}, 2000);