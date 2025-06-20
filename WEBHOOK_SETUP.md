# Twilio Webhook Configuration Guide

## Quick Setup Steps

### 1. Start the Backend Server
```bash
cd eugenia-backend
npm start
```
The server should start on port 3001.

### 2. Start ngrok (for local testing)
In a new terminal window:
```bash
ngrok http 3001
```

You'll see output like:
```
Forwarding  https://abc123xyz.ngrok.io -> http://localhost:3001
```

Copy the HTTPS URL (e.g., `https://abc123xyz.ngrok.io`)

### 3. Configure Twilio Webhook

1. **Log into Twilio Console**: https://console.twilio.com
2. **Navigate to**: Phone Numbers → Manage → Active Numbers
3. **Click on**: +18662981158 (Eugenia's number)
4. **In the Messaging section, configure**:
   - **"A message comes in" Webhook**: `https://[your-ngrok-subdomain].ngrok.io/webhook/twilio-sms`
   - **HTTP Method**: POST
   - **Save** the configuration

### 4. Update Environment Variables

Edit `eugenia-backend/.env`:
```bash
# For local testing
APP_DOMAIN=http://localhost:3000

# Make sure these are set
NODE_ENV=development
ALLOW_DEV_SMS=true
```

### 5. Test the Integration

1. **Send a test SMS** from +17068184445 to +18662981158
2. **Monitor the backend console** for incoming webhook logs
3. **Expected log sequence**:
   ```
   === Incoming SMS Received ===
   From: +17068184445
   To: +18662981158
   Message: [your test message]
   
   Lead found: Test Everitt (ID: 470)
   Incoming message stored in FUB notes
   AI Response: [generated response]
   AI response queued successfully
   ```
4. **Wait 45 seconds** for the AI response to be sent
5. **Check your phone** for the reply from Eugenia

## Verification Checklist

- [ ] Backend server running on port 3001
- [ ] ngrok tunnel active and showing connections
- [ ] Twilio webhook URL configured correctly
- [ ] Test SMS received and processed
- [ ] AI response sent after 45 seconds
- [ ] Messages appear in FUB conversation history

## Troubleshooting

### "No lead found for phone number"
- Ensure Test Everitt (ID: 470) has phone number +17068184445 in FUB
- Check phone number format in FUB (should work with any format)

### Webhook not receiving messages
- Verify ngrok is running and URL is correct in Twilio
- Check that backend server is running
- Look for connection attempts in ngrok web interface: http://127.0.0.1:4040

### AI not responding
- Check `customEugeniaTalkingStatus` is "active" for Test Everitt
- Verify Gemini API key is set in .env
- Check backend logs for AI generation errors

### Messages not appearing in FUB
- Verify FUB API credentials in .env
- Check that custom fields exist in FUB
- Look for FUB API errors in backend console

## Production Deployment

When ready for production:

1. **Deploy to Digital Ocean** (see DEPLOYMENT.md)
2. **Update Twilio webhook** to production URL:
   ```
   https://[your-app-name]-backend.ondigitalocean.app/webhook/twilio-sms
   ```
3. **Update environment variables**:
   ```bash
   NODE_ENV=production
   ALLOW_DEV_SMS=false
   APP_DOMAIN=https://[your-frontend-domain]
   ```

## Security Notes

- In production, webhook signature validation is enforced
- Never expose your ngrok URL publicly
- Rotate ngrok URLs regularly for security
- Monitor webhook logs for unauthorized access attempts