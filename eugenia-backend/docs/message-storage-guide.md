# Message Storage Configuration Guide

## Quick Start: How to Store More Messages

### Method 1: Environment Variable (Easiest)
Add this to your `.env` file:
```
STORAGE_MAX_MESSAGES=300
```
This will store up to 300 messages per lead.

### Method 2: Edit Configuration File
Edit `/config/storageConfig.js`:
```javascript
TARGET_MESSAGES: 300,  // Change this number
```

### Method 3: Use Enhanced Storage
For maximum storage with compression:
1. Replace `messageStorageService` with `messageStorageServiceEnhanced` in `fubService.js`
2. This automatically stores 50-500 messages based on available space

## Storage Limits

### Current Implementation (v1.0)
- **Default**: 200 messages per lead
- **Maximum Safe**: ~300-400 messages (depends on message length)
- **FUB Field Limit**: 64KB (we use 60KB to be safe)

### Message Size Estimates
- **Short messages** (50 chars): ~400 messages max
- **Average messages** (150 chars): ~250 messages max  
- **Long messages** (300 chars): ~150 messages max

## How It Works

Messages are stored in FUB's `background` field as JSON:
```json
{
  "conversations": [
    {
      "id": "msg_123",
      "direction": "inbound",
      "content": "Message text",
      "timestamp": "2025-01-01T12:00:00Z"
    }
  ],
  "metadata": {
    "messageCount": 200,
    "lastUpdated": "2025-01-01T12:00:00Z"
  }
}
```

## Advanced Options

### Enhanced Storage Features
The enhanced storage service (`messageStorageServiceEnhanced.js`) provides:
- **Dynamic Limits**: Automatically adjusts based on message size
- **Compression**: Older messages are compressed to save space
- **Smart Trimming**: Keeps most important recent messages
- **Can store 100-500 messages** depending on content

### To Enable Enhanced Storage:
1. Edit `services/fubService.js`
2. Change line 6:
   ```javascript
   // From:
   const messageStorageService = require('./messageStorageService');
   // To:
   const messageStorageService = require('./messageStorageServiceEnhanced');
   ```

## Monitoring Storage

Use the provided scripts to monitor storage:
```bash
# View messages for a lead
node view-lead-messages.js 470

# Test storage capacity
node test-notes-storage.js
```

## Best Practices

1. **Start Conservative**: Begin with 200 messages and increase if needed
2. **Monitor Usage**: Check storage stats regularly
3. **Archive Old Conversations**: Export old conversations before they're auto-removed
4. **Test Changes**: Always test with Test Everitt (ID: 470) first

## Troubleshooting

### "Storage limit exceeded" errors
- Reduce `STORAGE_MAX_MESSAGES` 
- Enable enhanced storage for compression
- Clear old test messages

### Messages not saving
- Check FUB API permissions
- Verify background field is being fetched with `?fields=allFields`
- Check console logs for storage errors

### Performance issues
- Large message counts (>300) may slow down API calls
- Consider using enhanced storage with compression
- Reduce AI context to last 20-30 messages