# Eugenia Testing Workflow - Lead 622

## Quick Start Testing

### 1. Basic Claude Sonnet 4 Test
```bash
cd eugenia-backend
node test-claude-622.js
```
This tests:
- Initial outreach generation
- Conversation replies
- Dynamic temperature adjustment

### 2. Full AI Optimization Test
```bash
TEST_LEAD_ID=622 node test-ai-optimizations.js
```
This tests:
- Smart context windowing
- Lead scoring
- Conversation analytics
- Source-specific variations
- Chain-of-thought prompting

## Production Testing Workflow

### Phase 1: Backend API Testing (15 min)

#### A. Start the Backend
```bash
cd eugenia-backend
node server.js
```

#### B. Test AI Generation Endpoints
```bash
# Test initial outreach
curl -X POST http://localhost:3001/api/generate-initial-message \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "622",
    "leadDetails": {
      "id": "622",
      "name": "Test Lead",
      "firstName": "Test",
      "source": "Zillow",
      "tags": ["Buyer"]
    }
  }'

# Test conversation reply
curl -X POST http://localhost:3001/api/generate-reply \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "622",
    "leadDetails": {
      "id": "622",
      "name": "Test Lead",
      "firstName": "Test"
    },
    "conversationHistory": [
      {
        "direction": "outbound",
        "content": "Hi! When are you looking to move?"
      },
      {
        "direction": "inbound",
        "content": "In about 2 months"
      }
    ],
    "currentMessage": "We need 3 bedrooms and good schools"
  }'
```

### Phase 2: Frontend Integration Testing (20 min)

#### A. Start Both Services
```bash
# Terminal 1
cd eugenia-backend
TEST_LEAD_ID=622 node server.js

# Terminal 2
cd eugenia-frontend
npm start
```

#### B. Test in UI
1. Open http://localhost:3000
2. Login with your credentials
3. Find lead 622 in the list
4. Click to open conversation
5. Type a message and click "Generate AI Response"
6. Verify response appears
7. Click "Send" to test sending (if Twilio configured)

### Phase 3: Webhook Testing (30 min)

#### A. Set Up Ngrok
```bash
ngrok http 3001
```

#### B. Configure Twilio Webhook
1. Copy ngrok HTTPS URL
2. Go to Twilio Console
3. Set webhook to: `https://[your-ngrok].ngrok.io/webhook/twilio-sms`

#### C. Test Incoming SMS
1. Send SMS to your Twilio number
2. Check backend logs for:
   - Webhook received
   - Lead lookup
   - AI response generation
   - SMS queued

### Phase 4: End-to-End Testing (45 min)

#### Test Scenarios for Lead 622

##### Scenario 1: New Lead Outreach
```javascript
// In backend console or test script
const message = await claudeService.generateInitialOutreach({
  id: '622',
  name: 'John Smith',
  source: 'Zillow',
  firstName: 'John'
}, 'Your Agency');

console.log('Initial:', message);
// Expected: Personalized greeting mentioning Zillow
```

##### Scenario 2: Qualification Flow
Simulate these messages in order:
1. Lead: "Hi, I'm interested in buying"
2. AI should ask about timeline
3. Lead: "In the next 3 months"
4. AI should ask about agent status
5. Lead: "No agent yet"
6. AI should ask about financing
7. Lead: "We're pre-approved for 500k"
8. AI should suggest scheduling

##### Scenario 3: High-Intent Detection
Test with:
- "I need to see homes ASAP"
- "Can we schedule a showing today?"
- "I want to make an offer"

AI should:
- Use lower temperature (0.3)
- Be direct about scheduling
- Possibly trigger escalation

##### Scenario 4: Low Engagement Recovery
After 2-3 short responses:
- Lead: "ok"
- Lead: "sure"
- Lead: "idk"

AI should:
- Switch to higher temperature (0.8)
- Try engagement boosters
- Ask different types of questions

### Phase 5: Performance Metrics

#### Monitor These KPIs:
1. **Response Time**: Should be < 2 seconds
2. **Response Length**: Should be < 160 characters
3. **Qualification Rate**: Track completed qualifications
4. **Escalation Rate**: How often human handoff triggered
5. **Error Rate**: Any failed API calls

#### Check Logs For:
```bash
# Success indicators
grep "✅" logs/app.log
grep "Lead Score:" logs/app.log
grep "Qualification complete" logs/app.log

# Error indicators
grep "❌" logs/app.log
grep "Error" logs/app.log
grep "Failed" logs/app.log
```

## Troubleshooting

### Common Issues

#### 1. Empty AI Responses
- Check Claude API key is valid
- Verify model name is correct: `claude-sonnet-4`
- Check token limits in .env

#### 2. Lead 622 Not Found
- Verify lead exists in FUB
- Check FUB API credentials
- Try with mock data first

#### 3. Webhook Not Working
- Ensure ngrok is running
- Check Twilio signature validation (disable in dev)
- Verify phone number format

#### 4. Frontend Connection Issues
- Check .env.local has correct API_URL
- Verify CORS is enabled in backend
- Check both services are running

## Quick Commands Reference

```bash
# Start everything
./start-eugenia.sh

# Test AI only
node test-claude-622.js

# Test with custom message
node -e "
const claude = require('./services/claudeService');
const ai = new claude(process.env.CLAUDE_API_KEY);
ai.generateReply({id:'622', name:'Test'}, [], 'Hello', 'Agency').then(console.log);
"

# Clear test lead data
npm run cleanup -- 622

# Monitor queues
node monitor-queues.js

# Check analytics
cat data/conversation-analytics.json | jq
```

## Expected Results

### Good Response Examples:
- "Perfect! I can help you find homes in that area. What's your timeline?"
- "Great! Are you already working with an agent?"
- "I'll have our specialist call you to schedule viewings. Best time?"

### Metrics Targets:
- Lead Score > 70: Hot lead, expect direct scheduling
- Lead Score 50-70: Warm lead, focus on qualification
- Lead Score < 50: Cold lead, build rapport first

## Next Steps After Testing

1. **If all tests pass**: Deploy to production
2. **If issues found**: Check error logs and fix
3. **Performance tuning**: Adjust temperatures and prompts
4. **A/B testing**: Try different opening messages
5. **Monitor analytics**: Review conversation patterns

## Support

- Check `AI_OPTIMIZATION_SUMMARY.md` for feature details
- Review `CLAUDE.md` for project context
- Run `node test-ai-optimizations.js` for system check