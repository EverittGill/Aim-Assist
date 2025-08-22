/**
 * Processes webhook events from various sources
 * Handles CRM webhooks, Twilio webhooks, etc.
 */

module.exports = async function processWebhook(job) {
  const { source, event, data } = job.data;
  
  console.log(`🔗 Processing webhook job ${job.id} from ${source}`);
  
  try {
    switch (source) {
      case 'twilio':
        return processTwilioWebhook(event, data);
      case 'fub':
        return processFUBWebhook(event, data);
      case 'stripe':
        return processStripeWebhook(event, data);
      default:
        console.warn(`Unknown webhook source: ${source}`);
        return { success: false, reason: 'Unknown source' };
    }
  } catch (error) {
    console.error(`❌ Webhook job ${job.id} failed:`, error);
    throw error;
  }
};

async function processTwilioWebhook(event, data) {
  // Process incoming SMS
  console.log('Processing Twilio webhook:', event);
  return { success: true };
}

async function processFUBWebhook(event, data) {
  // Process FUB events
  console.log('Processing FUB webhook:', event);
  return { success: true };
}

async function processStripeWebhook(event, data) {
  // Process Stripe events
  console.log('Processing Stripe webhook:', event);
  return { success: true };
}