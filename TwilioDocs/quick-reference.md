# Twilio Integration Quick Reference

## Essential Configuration

### Environment Variables Required
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 34 characters
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      # 32 characters
TWILIO_FROM_NUMBER=+1XXXXXXXXXX                        # Your Twilio phone number
```

### Webhook URLs to Configure in Twilio Console
1. **Incoming SMS**: `https://your-domain.com/webhook/twilio-sms`
2. **Status Callback**: `https://your-domain.com/webhook/twilio-status` (optional)

## Core Integration Points

### 1. Incoming SMS Flow
```
Lead texts Twilio number → Webhook receives SMS → Find lead by phone → 
Fetch FUB context → Generate AI response → Wait 45 seconds → 
Send SMS reply → Log to FUB
```

### 2. Outbound SMS Flow (New Lead)
```
Detect new lead with tags → Get lead phone → Generate first message → 
Send SMS → Update FUB custom fields → Log to FUB
```

### 3. Manual SMS from Frontend
```
User types message → Send as Eugenia → Use Twilio number → 
Log to FUB → Show in conversation
```

## Critical Functions

### TwilioService Methods
- `sendSMS(toNumber, message)` - Send SMS message
- `validateWebhookSignature(signature, url, params)` - Security validation
- `parseIncomingSMS(body)` - Extract webhook data

### Required Validations
1. **Phone Format**: Must be E.164 (+1XXXXXXXXXX)
2. **Signature**: Always validate X-Twilio-Signature
3. **Message Length**: Max 1600 characters per segment
4. **Lead Matching**: Phone → FUB lead lookup required

## Security Checklist
- [ ] HTTPS only for webhooks (no HTTP)
- [ ] Validate all webhook signatures
- [ ] Store auth token securely (never commit)
- [ ] Handle unknown phone numbers gracefully
- [ ] Implement rate limiting

## Testing Protocol
1. **Always use Test Everitt (ID: 470)**
2. **Test phone: +17068184445**
3. **Use ngrok for local webhook testing**
4. **Verify FUB logging after each test**

## Common Integration Issues

| Issue | Solution |
|-------|----------|
| Webhook timeout | Return response immediately, process async |
| Invalid phone format | Use E.164 format helper function |
| Signature validation fails | Check exact webhook URL matches |
| Messages not logging to FUB | Verify phone number format and lead ID |

## Emergency Contacts
- **Admin SMS alerts**: +17068184445
- **Admin email**: sellitwitheveritt@gmail.com
- **Urgent keywords**: "call me", "schedule showing", "talk to agent"