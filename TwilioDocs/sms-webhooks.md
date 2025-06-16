# Twilio SMS Webhooks Documentation

## Overview
Twilio webhooks allow your application to receive real-time notifications about SMS events. When someone sends a text to your Twilio number, Twilio makes an HTTP request to your webhook URL with details about the message.

## Webhook Configuration

### Setting Up Your Webhook URL
1. **Log into Twilio Console**
2. **Navigate to Phone Numbers → Manage → Active Numbers**
3. **Click on your Eugenia phone number**
4. **In the Messaging section, set:**
   - "A message comes in" webhook URL: `https://your-domain.com/webhook/twilio-sms`
   - HTTP Method: POST (recommended)

### Development Testing with ngrok
For local testing before deployment:
```bash
# Install ngrok
npm install -g ngrok

# Start your backend server (port 3001)
node server.js

# In another terminal, expose your local server
ngrok http 3001

# Use the ngrok URL in Twilio Console
# Example: https://abc123.ngrok.io/webhook/twilio-sms
```

## Incoming SMS Webhook Parameters

### Core Parameters (Always Present)
```javascript
{
  MessageSid: 'SM1234567890abcdef',       // Unique message ID
  AccountSid: 'ACxxxxxxxxxxxxxxxx',       // Your Twilio account SID
  MessagingServiceSid: 'MGxxxxxxxxxx',    // If using messaging service
  From: '+17068184445',                   // Sender's phone number
  To: '+1234567890',                      // Your Twilio number
  Body: 'Hello Eugenia!',                 // Message text (up to 1600 chars)
  NumMedia: '0',                          // Number of media attachments
  NumSegments: '1',                       // Number of message segments
  SmsMessageSid: 'SM1234567890abcdef',    // Same as MessageSid
  SmsStatus: 'received',                  // Message status
  ApiVersion: '2010-04-01'                // Twilio API version
}
```

### Media Parameters (When Media Present)
```javascript
{
  MediaContentType0: 'image/jpeg',        // MIME type of first media
  MediaUrl0: 'https://api.twilio.com/...' // URL to download media
  // Additional media items: MediaContentType1, MediaUrl1, etc.
}
```

### Geographic Parameters (When Available)
```javascript
{
  FromCity: 'ATLANTA',
  FromState: 'GA',
  FromZip: '30301',
  FromCountry: 'US',
  ToCity: 'SAN FRANCISCO',
  ToState: 'CA',
  ToZip: '94105',
  ToCountry: 'US'
}
```

## Webhook Security

### X-Twilio-Signature Validation
Twilio signs every webhook request. **ALWAYS validate signatures in production!**

```javascript
const twilio = require('twilio');

function validateTwilioWebhook(req, res, next) {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    params
  );

  if (!isValid) {
    return res.status(403).send('Forbidden');
  }

  next();
}
```

### Security Best Practices
1. **Always use HTTPS** - HTTP webhooks are insecure
2. **Validate signatures** - Use Twilio SDK, never custom implementation
3. **Don't use self-signed certificates** - Twilio won't accept them
4. **Handle evolving parameters** - Twilio may add new params anytime
5. **Implement idempotency** - Handle duplicate webhook calls

## Response Format

### Simple Acknowledgment (No Reply)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

### Reply with SMS
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for texting! Eugenia will respond shortly.</Message>
</Response>
```

### Using JSON Response (Recommended for Eugenia)
For async processing, return empty TwiML and send reply via API:
```javascript
// Acknowledge webhook immediately
res.type('text/xml');
res.send('<Response></Response>');

// Process and reply asynchronously
processIncomingMessage(req.body);
```

## Error Handling

### Webhook Timeouts
- Twilio waits **15 seconds** for response
- Return acknowledgment immediately, process async
- Timeouts result in error logs in Twilio Console

### Retry Policy
- Twilio retries failed webhooks (non-2xx response)
- Implements exponential backoff
- Maximum 11 attempts over 48 hours

### Error Response Codes
- **200 OK**: Success
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication failure
- **403 Forbidden**: Signature validation failed
- **500 Internal Server Error**: Server error

## Implementation Example for Eugenia

```javascript
// POST /webhook/twilio-sms
app.post('/webhook/twilio-sms', validateTwilioWebhook, async (req, res) => {
  try {
    // 1. Acknowledge immediately
    res.type('text/xml');
    res.send('<Response></Response>');

    // 2. Extract message data
    const { From, To, Body, MessageSid } = req.body;
    
    console.log(`Incoming SMS from ${From}: ${Body}`);

    // 3. Process asynchronously
    setImmediate(async () => {
      try {
        // Look up lead by phone number
        const lead = await findLeadByPhone(From);
        
        if (!lead) {
          console.error(`No lead found for phone: ${From}`);
          // Send notification to admin
          await notifyAdmin(`Unknown number texted: ${From}`);
          return;
        }

        // Log to FUB
        await logIncomingMessageToFUB(lead.id, Body, From, To);

        // Generate AI response with context
        const aiResponse = await generateAIResponse(lead, Body);

        // Send response after delay
        setTimeout(async () => {
          await sendSMSResponse(From, aiResponse);
          await logOutgoingMessageToFUB(lead.id, aiResponse, To, From);
        }, 45000); // 45-second delay

      } catch (error) {
        console.error('Error processing incoming SMS:', error);
        await notifyAdmin(`SMS processing error: ${error.message}`);
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});
```

## Testing Checklist

1. **Webhook URL Configuration**
   - [ ] Webhook URL set in Twilio Console
   - [ ] Using HTTPS in production
   - [ ] ngrok working for local testing

2. **Security**
   - [ ] Signature validation implemented
   - [ ] Auth token stored securely
   - [ ] Error responses don't leak sensitive data

3. **Message Processing**
   - [ ] Incoming messages logged correctly
   - [ ] Lead lookup by phone number works
   - [ ] Unknown numbers handled gracefully
   - [ ] 45-second delay implemented

4. **Error Handling**
   - [ ] Timeouts handled (15-second limit)
   - [ ] Duplicate messages handled
   - [ ] Failed processing doesn't crash webhook

## Common Issues

### "Webhook Error - 11200"
- Your server took too long to respond (>15 seconds)
- Solution: Return response immediately, process async

### "Certificate Error - 11237"
- SSL certificate issue
- Solution: Use valid certificate, not self-signed

### Messages Not Arriving
- Check webhook URL is correct
- Verify signature validation isn't rejecting valid requests
- Check server logs for errors

## Rate Limits
- Twilio has generous rate limits for webhooks
- Focus on your server's ability to handle volume
- Implement queue for high-volume processing