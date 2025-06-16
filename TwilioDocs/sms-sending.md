# Twilio SMS Sending Documentation

## Overview
This document covers sending SMS messages via Twilio for the Eugenia ISA system.

## Basic SMS Sending

### Using Twilio Node.js SDK
```javascript
const twilio = require('twilio');

// Initialize client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Send SMS
async function sendSMS(to, message) {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to: to
    });
    
    console.log(`SMS sent successfully. SID: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    throw error;
  }
}
```

## Phone Number Formatting

### E.164 Format Required
Twilio requires all phone numbers in E.164 format:
- **Correct**: +17068184445
- **Wrong**: 706-818-4445, (706) 818-4445, 7068184445

### Format Helper Function
```javascript
function formatPhoneForTwilio(phone) {
  if (!phone) return null;
  
  // Remove all non-numeric except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Add + if missing (assume US if 10 digits)
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}
```

## Message Status Callbacks

### Track Message Delivery
```javascript
const result = await client.messages.create({
  body: message,
  from: process.env.TWILIO_FROM_NUMBER,
  to: to,
  statusCallback: 'https://your-domain.com/webhook/twilio-status'
});
```

### Status Values
- `queued` - Message accepted by Twilio
- `sending` - Message being sent
- `sent` - Message sent to carrier
- `delivered` - Carrier confirmed delivery
- `failed` - Message failed
- `undelivered` - Carrier couldn't deliver

## Rate Limits & Best Practices

### SMS Rate Limits
- **1 SMS per second** per phone number (baseline)
- Higher volumes require short code or messaging service

### Best Practices
1. **Implement retry logic** for failed messages
2. **Add 45-second delay** for natural conversation flow
3. **Log all messages** to FUB for visibility
4. **Handle opt-outs** (STOP, UNSUBSCRIBE)
5. **Monitor delivery status** via callbacks

## Implementation for Eugenia

### Send AI Response
```javascript
async function sendAIResponse(leadPhone, aiMessage, leadId) {
  try {
    // Format phone number
    const formattedPhone = formatPhoneForTwilio(leadPhone);
    if (!formattedPhone) {
      throw new Error('Invalid phone number');
    }

    // Send with 45-second delay for natural feel
    await new Promise(resolve => setTimeout(resolve, 45000));

    // Send SMS
    const result = await twilioService.sendSMS(formattedPhone, aiMessage);

    // Log to FUB
    await fubService.logMessage({
      personId: leadId,
      message: aiMessage,
      toNumber: formattedPhone,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
      direction: 'outbound',
      messageSid: result.sid
    });

    return result;
  } catch (error) {
    console.error(`Failed to send AI response to ${leadPhone}:`, error);
    // Notify admin of failure
    await notifyAdmin(`SMS failed to ${leadPhone}: ${error.message}`);
    throw error;
  }
}
```

## Error Handling

### Common Errors
```javascript
// Error codes and handling
const ERROR_HANDLERS = {
  21211: 'Invalid phone number format',
  21408: 'Permission to send to this region denied',
  21610: 'Message body exceeds 1600 character limit',
  21614: 'Phone number is blacklisted',
  30003: 'Account suspended',
  30005: 'Unknown destination',
  30006: 'Landline or unreachable carrier',
  30007: 'Carrier filtering/spam detection'
};

function handleTwilioError(error) {
  const errorMessage = ERROR_HANDLERS[error.code] || error.message;
  console.error(`Twilio Error ${error.code}: ${errorMessage}`);
  return errorMessage;
}
```

## Testing with Test Everitt

```javascript
// Test SMS sending function
async function testSMSSending() {
  const TEST_LEAD = {
    id: '470',
    name: 'Test Everitt',
    phone: '+17068184445'
  };

  try {
    console.log('Testing SMS to Test Everitt...');
    const result = await sendAIResponse(
      TEST_LEAD.phone,
      'Hi Test Everitt! This is Eugenia testing SMS functionality.',
      TEST_LEAD.id
    );
    console.log('✅ SMS test successful:', result.sid);
  } catch (error) {
    console.error('❌ SMS test failed:', error);
  }
}
```