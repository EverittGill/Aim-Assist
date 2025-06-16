# Follow Up Boss Webhooks Documentation

## Overview
Webhooks allow your application to receive real-time notifications when events occur in Follow Up Boss. This is essential for keeping your system in sync with FUB data.

## Setup Requirements

### Prerequisites
- Only account **owners** can create webhooks
- Webhook endpoints must use **HTTPS** (HTTP is not supported)
- Each system is limited to **2 webhooks per event type**
- External systems must be registered with FUB (X-System header required)

### Webhook Registration
Register your webhooks through the FUB admin interface or API. Each webhook requires:
- Target URL (HTTPS only)
- Event types to subscribe to
- X-System identifier

## Webhook Payload Format

```json
{
  "eventId": "unique-event-id",
  "eventCreated": "2025-01-13T12:00:00Z",
  "event": "textMessagesCreated",
  "resourceIds": ["123", "456"],
  "uri": "https://api.followupboss.com/v1/textMessages?ids=123,456"
}
```

### Payload Fields
- `eventId`: Unique identifier for this webhook event
- `eventCreated`: ISO 8601 timestamp when event occurred
- `event`: Type of event (see event types below)
- `resourceIds`: Array of affected resource IDs
- `uri`: API endpoint to fetch full resource details

## Security & Verification

### Webhook Signature Verification
Every webhook includes a `FUB-Signature` header for verification:

1. Base64 encode the JSON payload
2. Create SHA256 hash using your X-System-Key as the secret
3. Compare calculated signature with the FUB-Signature header

```javascript
// Example verification (Node.js)
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, systemKey) {
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const calculatedSignature = crypto
    .createHmac('sha256', systemKey)
    .update(base64Payload)
    .digest('hex');
  
  return calculatedSignature === signature;
}
```

## Available Event Types

### Text Message Events (Most relevant for Eugenia ISA)
- `textMessagesCreated` - New text message created
- `textMessagesUpdated` - Text message updated
- `textMessagesDeleted` - Text message deleted

### People/Lead Events
- `peopleCreated` - New contact created
- `peopleUpdated` - Contact information updated
- `peopleDeleted` - Contact deleted

### Communication Events
- `notesCreated` / `notesUpdated` / `notesDeleted`
- `emailsCreated` / `emailsUpdated` / `emailsDeleted`
- `callsCreated` / `callsUpdated` / `callsDeleted`

### Other Events
- `tasksCreated` / `tasksUpdated` / `tasksDeleted`
- `appointmentsCreated` / `appointmentsUpdated` / `appointmentsDeleted`
- `dealsCreated` / `dealsUpdated` / `dealsDeleted`
- `stagesCreated` / `stagesUpdated` / `stagesDeleted`
- `emSent` / `emOpened` / `emClicked` / `emReplied` / `emBounced` / `emOptedOut`

## Best Practices

### 1. Decouple Webhook Receipt from Processing
**Recommended Architecture:**
```
Webhook Received → Return 200 OK → Queue for Processing → Fetch Full Data → Process
```

Don't fetch resource data synchronously in the webhook handler. Instead:
1. Receive webhook
2. Return 200 OK immediately
3. Queue the event for async processing
4. Fetch full resource data from the provided URI
5. Process the data

### 2. Handle Retries
- FUB will retry failed webhooks (non-2xx response)
- Implement idempotency to handle duplicate events
- Use the `eventId` to detect duplicates

### 3. Fetch Full Resource Data
The webhook payload only contains resource IDs. Always fetch the complete data:
```javascript
// Example: Fetch text messages after webhook
const response = await fetch(webhookPayload.uri, {
  headers: {
    'Authorization': `Basic ${btoa(apiKey + ':')}`,
    'X-System': 'YourSystemName',
    'X-System-Key': 'YourSystemKey'
  }
});
```

## Implementation Example for Eugenia ISA

### Incoming SMS Webhook Handler
```javascript
// POST /webhook/twilio-sms
async function handleIncomingSmsWebhook(req, res) {
  const { eventId, event, resourceIds, uri } = req.body;
  const signature = req.headers['fub-signature'];
  
  // 1. Verify signature
  if (!verifyWebhookSignature(req.body, signature, process.env.FUB_X_SYSTEM_KEY)) {
    return res.status(401).send('Invalid signature');
  }
  
  // 2. Return 200 immediately
  res.status(200).send('OK');
  
  // 3. Process async
  if (event === 'textMessagesCreated') {
    processIncomingTextMessages(resourceIds, uri);
  }
}

async function processIncomingTextMessages(ids, uri) {
  // Fetch full message data from FUB
  const messages = await fetchFromFUB(uri);
  
  for (const message of messages) {
    // Check if message is from a lead (not agent)
    if (message.direction === 'inbound') {
      // Trigger AI response generation
      await generateAndSendAIResponse(message);
    }
  }
}
```

## Troubleshooting

### Common Issues
1. **401 Unauthorized**: Check X-System and X-System-Key headers
2. **Webhook not firing**: Ensure HTTPS endpoint and owner permissions
3. **Duplicate events**: Implement idempotency with eventId tracking
4. **Missing data**: Always fetch full resource from provided URI

### Testing Webhooks
- Use ngrok or similar tools for local development
- Create test events in FUB to trigger webhooks
- Log all webhook payloads for debugging
- Monitor webhook delivery status in FUB admin