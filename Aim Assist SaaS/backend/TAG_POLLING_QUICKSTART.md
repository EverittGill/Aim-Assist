# 🚀 AIM_ASSIST Tag Polling System - Quick Start Guide

## Overview
The Tag Polling System continuously monitors Follow Up Boss for leads tagged with "AIM_ASSIST" and automatically:
1. Syncs them to Supabase
2. Sends personalized auto-text messages
3. Enables AI for automated conversations

## Setup Steps

### 1. Run Database Migration
```bash
# Apply the tag polling system tables
psql $DATABASE_URL < migrations/012_tag_polling_system.sql
```

### 2. Setup Auto-Text Rule
```bash
# Creates the AIM_ASSIST auto-text rule
node scripts/setup-aim-assist-rule.js
```

### 3. Test the System
```bash
# Run comprehensive test suite
node test-tag-polling-flow.js
```

### 4. Start Polling

#### Option A: Manual One-Time Poll
```bash
# Poll for AIM_ASSIST leads right now
curl -X POST http://localhost:3001/api/tag-poll/AIM_ASSIST \
  -H "Content-Type: application/json" \
  -d '{
    "processImmediately": true,
    "enableAI": true,
    "sendAutoText": true
  }'
```

#### Option B: Schedule Automatic Polling (Recommended)
```bash
# Schedule polling every 3 minutes
curl -X POST http://localhost:3001/api/tag-poll/schedule/AIM_ASSIST \
  -H "Content-Type: application/json" \
  -d '{
    "intervalMinutes": 3,
    "processImmediately": true,
    "enableAI": true,
    "sendAutoText": true
  }'
```

### 5. Monitor the System

#### Check Polling Status
```bash
# Get stats for AIM_ASSIST tag
curl http://localhost:3001/api/tag-poll/stats/AIM_ASSIST
```

#### View All Scheduled Polls
```bash
# See all active polling schedules
curl http://localhost:3001/api/tag-poll/schedules
```

#### View Queue Status
```bash
# Monitor the queue system
curl http://localhost:3001/api/queues/stats
```

## How It Works

### Polling Flow
1. **Every 3 minutes** (configurable), the system queries FUB for leads with "AIM_ASSIST" tag
2. **New leads** are added to Supabase with AI enabled
3. **Existing leads** are updated if changed
4. **Auto-text** is queued with 30-60 second delay for natural timing
5. **AI responds** to any replies automatically

### Lead Processing
- ✅ **Deduplication**: Won't process the same lead twice within 24 hours
- ✅ **Phone validation**: Normalizes all phones to E.164 format
- ✅ **Business hours**: Only sends texts 9am-8pm ET (configurable)
- ✅ **Safety limits**: Max 100 texts/day per rule
- ✅ **Exclusions**: Skips leads tagged with DO_NOT_TEXT, VIP, or MANUAL_ONLY

### Message Template
Default message sent to AIM_ASSIST leads:
```
Hi {firstName}! I saw you were interested in learning more about available properties in the area. I'm here to help you find exactly what you're looking for. What specific features are most important to you in your next home?
```

## Configuration

### Adjust Polling Interval
```javascript
// In TagPollingScheduler configuration
intervalMinutes: 2  // Poll every 2 minutes instead of 3
```

### Modify Auto-Text Message
```javascript
// In scripts/setup-aim-assist-rule.js
message_template: "Your custom message here with {firstName} variable"
```

### Change Business Hours
```javascript
// In auto-text rule configuration
send_window_start: '08:00:00',  // 8am
send_window_end: '21:00:00',    // 9pm
timezone: 'America/Los_Angeles'  // Pacific time
```

## Troubleshooting

### Leads Not Being Found
1. Verify leads have "AIM_ASSIST" tag in FUB
2. Check tenant/organization ID is correct
3. Review logs: `tail -f logs/tag-polling.log`

### Auto-Text Not Sending
1. Verify Twilio credentials in .env
2. Check business hours settings
3. Ensure lead has valid phone number
4. Review queue status: `curl http://localhost:3001/api/queues/stats`

### Polling Not Running
1. Check Redis is running: `redis-cli ping`
2. Verify schedule exists: `curl http://localhost:3001/api/tag-poll/schedules`
3. Check queue processor logs

## Stop/Pause Polling

### Remove Schedule for Specific Tag
```bash
curl -X DELETE http://localhost:3001/api/tag-poll/schedule/AIM_ASSIST
```

### Pause All Polling for Tenant
```javascript
TagPollingScheduler.pauseSchedules(tenantId)
```

## Performance Notes

- **API Efficiency**: Only fetches leads with specific tags
- **Processing**: ~100 leads/second
- **Queue Capacity**: 10,000+ messages
- **Memory Usage**: ~50MB per 1000 leads
- **Recommended**: Use webhooks for real-time updates in production

## Next Steps

1. **Add More Tags**: Create rules for other tags like "HOT_LEAD", "PRIORITY"
2. **Customize Messages**: Different templates per tag
3. **Add Webhooks**: Real-time processing instead of polling
4. **Analytics**: Track conversion rates per tag
5. **A/B Testing**: Test different message templates

## Support

For issues or questions:
1. Check logs: `tail -f logs/*.log`
2. Run tests: `node test-tag-polling-flow.js`
3. Review queue stats: `curl http://localhost:3001/api/queues/stats`
4. Check database: `psql -c "SELECT * FROM tag_poll_history"`