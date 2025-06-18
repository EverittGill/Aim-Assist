# Queue System Testing Guide

## Overview
We've implemented Bull Queue with Redis for reliable message processing and Sentry for error tracking.

## Testing the Queue System

### 1. Verify Redis is Running
```bash
brew services list | grep redis
# Should show: redis started
```

### 2. Test Queue Infrastructure
```bash
cd eugenia-backend
node test-queue-system.js
```

This will:
- Initialize queues
- Add test jobs (SMS and lead processing)
- Show queue statistics
- Monitor job events
- Note: Jobs will fail since services aren't initialized - this is expected

### 3. Monitor Queue Stats (Live)
In a new terminal:
```bash
cd eugenia-backend
node monitor-queues.js
```

This shows real-time queue statistics refreshing every 2 seconds.

### 4. Check Queue Stats via API
```bash
curl http://localhost:3001/api/queues/stats | jq
```

## How the Queue System Works

### SMS Queue
- Processes outgoing SMS messages with retry logic
- 45-second delay for natural conversation timing
- Automatically logs to FUB after sending
- 3 retry attempts with exponential backoff

### Lead Queue  
- Processes new leads for initial AI outreach
- Generates personalized messages
- Updates FUB custom fields
- Lower concurrency (2 workers) to avoid overwhelming APIs

### Benefits
1. **Reliability**: Messages won't be lost if server crashes
2. **Natural Timing**: 45-second delay makes AI feel more human
3. **Error Recovery**: Automatic retries for transient failures
4. **Monitoring**: Real-time visibility into queue health
5. **Scalability**: Can process multiple messages concurrently

## Sentry Integration
Errors are automatically captured and sent to Sentry when `SENTRY_DSN` is configured in `.env`.

## Next Steps
Once Twilio A2P registration is complete, we can test the full message flow:
1. Send SMS to Eugenia's number
2. Watch webhook receive it
3. See AI response queued
4. Observe 45-second delay
5. Confirm SMS sent and logged to FUB