# Twilio Messaging Service Webhook Configuration

## Why Use Messaging Service?

Your phone number is already in a Messaging Service, which provides:
- **Sticky Sender**: Each lead always texts with the same number
- **Opt-out Compliance**: Automatic STOP/START handling (legally required)
- **Delivery Tracking**: Message status and receipts
- **Retry Logic**: Automatic retries for failed messages

## Configuration Steps

### 1. Access Your Messaging Service
1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging → Services**
3. Click on **"Default Messaging Service for Conversations"**

### 2. Configure the Webhook
1. Find the **"Integration"** or **"Sender Pool"** section
2. Look for **"Inbound Settings"** or **"Webhooks"**
3. Configure:
   - **REQUEST URL**: `https://7a17-2601-346-700-b6e7-c12a-4327-3c5d-6814.ngrok-free.app/webhook/twilio-sms`
   - **REQUEST METHOD**: POST
   - **FALLBACK URL**: Leave empty (optional)

### 3. Configure Status Callbacks (Optional)
- **DELIVERY STATUS CALLBACK URL**: Can be left empty
- Useful for tracking message delivery success

### 4. Save Configuration
- Click **"Save"** at the bottom of the page
- Changes take effect immediately

## Testing

1. Send a test SMS to +18662981158
2. Check your backend console for logs:
   ```
   === Incoming SMS Received ===
   From: +17068184445
   To: +18662981158
   Message: [your message]
   ```

3. Wait ~45 seconds for AI response

## Troubleshooting

### If webhook still isn't called:
1. Verify the Messaging Service shows your webhook URL
2. Check that no other services/integrations are overriding it
3. Ensure your ngrok tunnel is still active
4. Try removing and re-adding the webhook URL

### For production:
- Replace ngrok URL with your production domain
- Enable webhook signature validation
- Set up status callbacks for monitoring

## Benefits vs Direct Configuration

| Feature | Direct Webhook | Messaging Service |
|---------|---------------|-------------------|
| Opt-out handling | Manual | Automatic ✓ |
| Sticky sender | Manual | Automatic ✓ |
| Multi-number support | Complex | Easy ✓ |
| Delivery tracking | Basic | Advanced ✓ |
| Configuration | Per-number | Centralized ✓ |