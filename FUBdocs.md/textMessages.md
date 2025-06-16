# Follow Up Boss Text Messages API Documentation

## Overview
The `/textMessages` endpoint allows you to log text message conversations in Follow Up Boss. **Important**: This endpoint only creates records of messages - it does NOT send actual SMS messages.

## Endpoint Details

### URL
```
POST https://api.followupboss.com/v1/textMessages
```

### Authentication Requirements
1. **Basic Authentication**: Use your FUB API key as username (password blank)
2. **System Headers**: Required for all requests
   - `X-System`: Your registered system name
   - `X-System-Key`: Your system key

### Access Restrictions
- **Registered Systems Only**: External systems must be registered with FUB
- Contact support@followupboss.com to register your system

## Request Format

### Required Headers
```http
Authorization: Basic [base64(apiKey:)]
X-System: YourSystemName
X-System-Key: YourSystemKey
Content-Type: application/json
```

### Request Body Schema
Based on the FUB integration patterns and error messages from our codebase:

```json
{
  "personId": "123",           // Required: FUB person/lead ID
  "message": "Message text",   // Required: The message content
  "toNumber": "+1234567890",   // Required: Recipient phone (E.164 format)
  "fromNumber": "+0987654321", // Required: Sender phone (E.164 format)
  "created": "2025-01-13T12:00:00Z", // Optional: ISO 8601 timestamp
  "direction": "outbound",     // Optional: "inbound" or "outbound"
  "userId": "456"              // Optional: FUB user ID who sent message
}
```

### Field Details

#### personId (Required)
- The FUB ID of the person/lead this message relates to
- Must be a valid person ID in the FUB system

#### message (Required)
- The actual text message content
- No specific length limit documented, but keep under 1600 chars for SMS standards

#### toNumber (Required)
- Phone number of the recipient
- **Must be in E.164 format** (e.g., +12025551234)
- Include country code with + prefix

#### fromNumber (Required)
- Phone number of the sender
- **Must be in E.164 format**
- For outbound: Your Twilio/SMS number
- For inbound: The lead's phone number

#### created (Optional)
- ISO 8601 formatted timestamp
- If omitted, FUB uses current time
- Example: "2025-01-13T15:30:00Z"

#### direction (Optional)
- "outbound" - Message sent to lead
- "inbound" - Message received from lead
- Helps FUB display conversation correctly

#### userId (Optional)
- FUB user ID who sent the message
- Use for outbound messages sent by specific agents
- Leave empty for AI-generated messages

## Phone Number Formatting

### E.164 Format Requirements
FUB requires phone numbers in E.164 format:
- Start with + and country code
- No spaces, dashes, or parentheses
- US example: +12025551234
- UK example: +442071234567

### Handling Multiple Phone Formats
Our integration handles various input formats:
```javascript
function formatPhoneForFUB(phone) {
  if (!phone) return null;
  
  // Remove all non-numeric except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Add + if missing
  if (!cleaned.startsWith('+')) {
    // Assume US number if 10 digits
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}
```

## Response Format

### Success Response (200 OK)
```json
{
  "id": "789",
  "personId": "123",
  "message": "Message text",
  "created": "2025-01-13T12:00:00Z",
  "direction": "outbound",
  // ... other fields
}
```

### Error Responses

#### 400 Bad Request
Missing required fields:
```json
{
  "error": "Validation Error",
  "message": "toNumber field is required"
}
```

#### 401 Unauthorized
Invalid authentication:
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key or system credentials"
}
```

#### 404 Not Found
Invalid person ID:
```json
{
  "error": "Not Found",
  "message": "Person with ID 123 not found"
}
```

## Integration Best Practices

### 1. Phone Number Validation
Always validate and format phone numbers before sending:
```javascript
async function logMessageToFUB(personId, message, toNumber, fromNumber) {
  // Format phone numbers
  const formattedTo = formatPhoneForFUB(toNumber);
  const formattedFrom = formatPhoneForFUB(fromNumber);
  
  if (!formattedTo || !formattedFrom) {
    throw new Error('Invalid phone number format');
  }
  
  // Send to FUB
  return await fubAPI.post('/textMessages', {
    personId,
    message,
    toNumber: formattedTo,
    fromNumber: formattedFrom,
    direction: 'outbound',
    created: new Date().toISOString()
  });
}
```

### 2. Error Handling
Implement robust error handling:
```javascript
try {
  await logMessageToFUB(leadId, aiMessage, leadPhone, twilioNumber);
} catch (error) {
  if (error.response?.status === 400) {
    // Handle validation errors
    console.error('Validation error:', error.response.data);
    
    // Common issue: missing phone number
    if (error.response.data.message.includes('toNumber')) {
      // Try to fetch lead's phone from FUB
      const lead = await fetchLeadFromFUB(leadId);
      // Retry with fetched phone
    }
  }
}
```

### 3. Bi-directional Logging
Log both outbound and inbound messages:
```javascript
// Outbound (AI to Lead)
await fubAPI.post('/textMessages', {
  personId: leadId,
  message: aiResponse,
  toNumber: leadPhone,
  fromNumber: twilioNumber,
  direction: 'outbound',
  userId: process.env.FUB_USER_ID_FOR_AI
});

// Inbound (Lead to AI)
await fubAPI.post('/textMessages', {
  personId: leadId,
  message: leadMessage,
  toNumber: twilioNumber,
  fromNumber: leadPhone,
  direction: 'inbound'
});
```

### 4. Conversation Context
When logging messages, maintain conversation flow:
1. Log inbound message from lead
2. Generate AI response
3. Log outbound AI response
4. Both appear in FUB's native text interface

## Common Issues & Solutions

### Issue: "toNumber field is required"
**Cause**: Missing or incorrectly formatted phone number
**Solution**: 
1. Ensure phone is in E.164 format
2. Fetch lead data if phone missing
3. Validate before sending

### Issue: Messages not showing in FUB
**Cause**: Invalid personId or missing system headers
**Solution**:
1. Verify personId exists in FUB
2. Check X-System headers are included
3. Ensure direction field is set correctly

### Issue: Phone validation failures
**Cause**: Various phone formats from different sources
**Solution**: Implement comprehensive phone formatting that handles:
- 10-digit US numbers
- Numbers with country codes
- Numbers with formatting characters
- International numbers

## Testing

### Test with curl
```bash
curl -X POST https://api.followupboss.com/v1/textMessages \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
  -H "X-System: YourSystemName" \
  -H "X-System-Key: YourSystemKey" \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "470",
    "message": "Test message",
    "toNumber": "+12025551234",
    "fromNumber": "+19995551234",
    "direction": "outbound"
  }'
```

### Test Lead ID
- Use Test Everitt (ID: 470) for all testing
- Never use production leads for testing

## Rate Limits
- No specific rate limits documented
- Best practice: Implement exponential backoff for retries
- Batch operations where possible