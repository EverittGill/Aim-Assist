# FUB Notes-Based Message Storage

## Overview
Since FUB may not provide access to text message data via their API, we've implemented a solution that stores all SMS conversations in the lead's notes field (background field) as JSON data.

## How It Works

### 1. Storage Structure
Messages are stored in the FUB `background` field with special markers:
```
[EUGENIA_MESSAGES_START]{json_data}[EUGENIA_MESSAGES_END]
```

The JSON structure contains:
- `conversations`: Array of message objects
- `metadata`: Version info, timestamps, and storage stats

### 2. Message Format
Each message contains:
```javascript
{
  id: "msg_uniqueid",
  direction: "inbound|outbound",
  type: "sms|ai",
  content: "Message text",
  timestamp: "ISO 8601 timestamp",
  twilioSid: "Twilio message ID",
  fubLogged: true/false
}
```

### 3. Storage Limits
- Maximum 50 messages retained (configurable)
- 60KB storage limit (leaves buffer for FUB's 64KB field limit)
- Automatic compression when approaching limits
- Oldest messages removed when limit exceeded

## Implementation Details

### New Services
1. **messageStorageService.js** - Core message storage logic
   - Parse/format messages for FUB notes
   - Handle storage limits and compression
   - Provide storage statistics

### Updated Services
1. **fubService.js** - Added methods:
   - `updateLeadNotes()` - Update notes field with message storage
   - `getLeadMessageStorage()` - Retrieve parsed messages from notes
   - `addMessageToLeadStorage()` - Add new message to storage

2. **conversationService.js** - Modified to:
   - Fetch messages from notes instead of FUB API
   - Extract clean notes (without message JSON)
   - Format messages for AI context

3. **Webhook & Routes** - All message logging now:
   - Stores in FUB notes (primary)
   - Attempts FUB text message API (fallback)

## Usage

### Testing
```bash
# Test the storage system with Test Everitt (ID: 470)
node test-notes-storage.js

# View messages for any lead
node view-lead-messages.js <leadId>
```

### Monitoring
The system logs storage statistics and warnings when:
- Storage approaches 80% capacity
- Messages are compressed
- Storage operations fail

## Benefits
1. **No API Dependency** - Works even without FUB text message access
2. **Full Control** - Complete ownership of conversation data
3. **AI Context** - Always have conversation history for AI responses
4. **Backward Compatible** - Still attempts FUB text message logging

## Migration Notes
- Existing conversations won't be in notes (only new messages)
- Manual migration possible via scripts if needed
- Notes field preserves any existing content

## Future Enhancements
1. Message archiving for long conversations
2. Export functionality
3. Search within stored messages
4. Automated backup to external database