# Handoff to New Claude Instance - Eugenia ISA Project

## Current Situation (2025-01-20, 11:45 AM EST)

You're taking over work on the Eugenia ISA project. The Twilio webhook integration is complete but has three critical issues preventing it from working properly.

### What Just Happened
1. User texted "Hey I want a house on Amelia Island" to +18662981158
2. Webhook received the message and logged it to FUB successfully
3. AI failed to generate a response (`finishReason: MAX_TOKENS`)
4. When SMS was attempted, it used wrong phone number (+19044416896)

### Three Critical Issues to Fix

#### 1. Wrong Phone Number Bug
**Problem**: SMS being sent from +19044416896 instead of +18662981158
**Root Cause**: In `routes/webhooks.js` line 167:
```javascript
fromNumber: incomingMessage.to,  // This is WRONG - it's using the recipient's number
```
**Fix**: Change to:
```javascript
fromNumber: process.env.TWILIO_FROM_NUMBER,  // Always use Eugenia's number
```
**Also fix**: Same issue in `workers/smsProcessor.js` line 39

#### 2. AI Response Failing
**Problem**: Gemini returns empty response with `finishReason: MAX_TOKENS`
**Root Cause**: Prompt is 1,617 characters for just 9 messages - too long
**Quick Fix**: Increase `GEMINI_MAX_TOKENS=2000` in .env
**Better Fix**: Implement smart context window (see below)

#### 3. Scaling Issue
**Problem**: Code includes ALL conversation history, will eventually fail
**Root Cause**: In `geminiService.js` line 214:
```javascript
const recentMessages = messages; // This includes EVERYTHING
```
**Fix**: Limit to recent messages:
```javascript
const recentMessages = messages.slice(-20); // Last 20 messages only
```

## Implementation Plan

### Phase 1: Quick Fixes (Get it working NOW - 30 mins)
1. Fix the phone number issue in both files
2. Increase GEMINI_MAX_TOKENS to 2000 in .env
3. Test with user's phone to verify it works

### Phase 2: Smart Context Window (Make it scale - 1 hour)
1. Limit conversation history to last 20 messages
2. Create summary of older conversations
3. Extract and track key facts (timeline, budget, location)
4. Optimize prompt to remove emojis and redundancy

### Phase 3: Claude 3.5 Sonnet Migration (Make it excellent - 2-3 hours)
User wants to switch to Claude for better quality. Benefits:
- 200k context window (no more token issues)
- More natural conversation
- Better at following instructions
- Worth the higher cost for premium product

## Key Project Context

- **Test Lead Only**: ID 470 (Test Everitt, +17068184445)
- **Twilio Number**: +18662981158 (toll-free, verified)
- **Webhook URL**: Configured in Twilio Messaging Service
- **Current Stack**: Express + Gemini + Twilio + FUB + Redis queues
- **45-second delay**: Intentional for natural conversation timing

## Files to Focus On

1. `/routes/webhooks.js` - Main webhook handler (fix line 167)
2. `/workers/smsProcessor.js` - SMS queue processor (fix line 39)
3. `/services/geminiService.js` - AI service (implement context window)
4. `/.env` - Configuration (increase token limit)

## Testing Process

1. Start backend: `cd eugenia-backend && npm start`
2. Ensure ngrok is running (already configured in Twilio)
3. Send test SMS to +18662981158
4. Watch console for webhook logs
5. Verify AI generates response
6. Confirm SMS sent from correct number
7. Check 45-second delay works

## Success Criteria

- ✅ SMS responses come from +18662981158
- ✅ AI generates meaningful responses
- ✅ System handles 50+ message conversations
- ✅ Natural conversation flow maintained

The user is ready to switch instances for better performance. Fix these issues first, then consider the Claude migration for quality improvement.