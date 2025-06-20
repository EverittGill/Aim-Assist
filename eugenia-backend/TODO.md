# TODO - Eugenia ISA Project

## Current Status (2025-01-20)

### ✅ Completed
- Twilio webhook implementation complete
- Messaging Service configured with webhook URL
- FUB message logging working (both notes and text messages)
- AI qualification system implemented
- Queue system with Redis for reliable message delivery
- Development mode for testing with lead 470

### 🔧 In Progress - Twilio Integration Issues

#### Problem 1: Wrong Phone Number
- **Issue**: SMS being sent from +19044416896 instead of verified +18662981158
- **Cause**: Webhook handler using `incomingMessage.to` instead of `TWILIO_FROM_NUMBER`
- **Fix**: Update `routes/webhooks.js` line 167 and `workers/smsProcessor.js` line 39

#### Problem 2: Empty AI Responses
- **Issue**: Gemini returning empty responses with `finishReason: MAX_TOKENS`
- **Cause**: Prompt too long (1,617 chars for just 9 messages)
- **Fix**: Implement smart context window or increase token limit

#### Problem 3: Scaling Issue
- **Issue**: Including ALL conversation history will eventually exceed any token limit
- **Cause**: Line 214 in `geminiService.js`: `const recentMessages = messages;`
- **Fix**: Limit to recent messages + summary of older conversations

## Implementation Plan

### Phase 1: Quick Fixes (30 minutes)
1. **Fix Phone Number Issue**:
   ```javascript
   // In routes/webhooks.js line 167, change:
   fromNumber: incomingMessage.to,  // This is wrong
   // To:
   fromNumber: process.env.TWILIO_FROM_NUMBER,  // Always use Eugenia's number
   ```

2. **Temporary Token Fix**:
   ```bash
   # In .env, change:
   GEMINI_MAX_TOKENS=2000  # or higher
   ```

### Phase 2: Smart Context Window (1 hour)
1. **Limit Message History**:
   ```javascript
   // In geminiService.js formatConversationHistory():
   const recentMessages = messages.slice(-20); // Last 20 messages only
   ```

2. **Add Conversation Summary**:
   ```javascript
   // Track key facts separately:
   const keyFacts = {
     timeline: extractTimeline(messages),
     budget: extractBudget(messages),
     location: extractLocation(messages),
     preApproved: extractFinancing(messages)
   };
   ```

3. **Optimize Prompt**:
   - Remove emoji headers from ISA prompts
   - Reduce redundant instructions
   - Use concise format

### Phase 3: Claude 3.5 Sonnet Migration (2-3 hours)
1. **Setup**:
   ```bash
   npm install @anthropic-ai/sdk
   ```

2. **Create Claude Service**:
   ```javascript
   // services/claudeService.js
   const Anthropic = require('@anthropic-ai/sdk');
   
   class ClaudeService {
     constructor(apiKey) {
       this.client = new Anthropic({ apiKey });
     }
     
     async generateReply(leadDetails, conversationHistory, currentMessage, agencyName) {
       const response = await this.client.messages.create({
         model: 'claude-3-5-sonnet-20241022',
         max_tokens: 200,
         messages: [{
           role: 'user',
           content: this.buildPrompt(...)
         }]
       });
       return this.parseResponse(response);
     }
   }
   ```

3. **Benefits**:
   - 200k token context (vs 32k for Gemini)
   - More natural conversation style
   - Better instruction following
   - No more context window worries

## Next Steps After Fixes

1. **Optimize Eugenia's Conversation Style**
   - Less robotic, more natural
   - Better question flow
   - Smarter escalation detection

2. **Enhanced Lead Response Triggers**
   - Keyword-based notifications
   - Engagement level tracking
   - Custom alert rules

3. **Digital Ocean Deployment**
   - App Platform setup
   - Environment configuration
   - Domain and SSL setup

## Testing Checklist

- [ ] Send test SMS to +18662981158
- [ ] Verify response comes from correct number
- [ ] Check AI generates meaningful response
- [ ] Confirm 45-second delay works
- [ ] Verify FUB logging successful
- [ ] Test with 50+ message conversation
- [ ] Monitor token usage and costs