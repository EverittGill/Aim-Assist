# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**IMPORTANT**: When starting a new session, read this file first to understand the project context, recent work, and critical requirements.

## Project Overview
Eugenia ISA (Inside Sales Agent) is a full-stack real estate lead management system with AI-powered lead nurturing capabilities. It integrates with Follow Up Boss CRM and uses Google Gemini AI for generating personalized messages.

## Commands

### Frontend Development (eugenia-frontend/)
```bash
cd eugenia-frontend
npm install          # Install dependencies
npm start           # Start development server on port 3000
npm build           # Create production build
npm test            # Run tests
```

### Backend Development (eugenia-backend/)
```bash
cd eugenia-backend
npm install          # Install dependencies
node server.js      # Start Express server on port 3001
```

## Architecture

### Frontend
- **React 19.1.0** application with Create React App
- **Tailwind CSS + DaisyUI** for styling
- **Components**: Lead management UI with modals, lists, and detail views
- **Services**: 
  - `apiService.js`: Backend API integration
  - `geminiService.js`: Google Gemini AI integration
- **State Management**: React hooks and local storage

### Backend
- **Express 5.1.0** server with CORS enabled
- **Services Architecture**:
  - `authService.js`: JWT authentication with 7-day token expiration
  - `conversationService.js`: CRITICAL - Fetches full conversation history from FUB for context retention
  - `fubService.js`: FUB API integration with phone validation and SMS logging
  - `geminiService.js`: AI message generation with context awareness
  - `twilioService.js`: SMS sending/receiving (pending setup)
- **API Endpoints**:
  - `GET /api/leads`: Fetch leads from Follow Up Boss (✅ Implemented)
  - `POST /api/auth/login`: User authentication (✅ Implemented)
  - `POST /api/auth/verify`: Token verification (✅ Implemented)
  - `POST /api/auth/refresh`: Token refresh (✅ Implemented)
  - `POST /api/generate-initial-message`: Generate AI initial outreach (✅ Implemented)
  - `POST /api/generate-reply`: Generate AI conversation reply (✅ Implemented)
  - `POST /api/leads`: Create new lead (✅ Implemented)
  - `DELETE /api/leads/:id`: Delete lead (✅ Implemented)
  - `PUT /api/leads/:id/status`: Update lead status/AI pause state (✅ Implemented)
  - `POST /api/send-ai-message`: Send AI-generated message via SMS (✅ Implemented - needs Twilio)
  - `POST /api/log-incoming-message`: Log lead reply and get AI response (✅ Implemented)
  - `POST /api/initiate-ai-outreach`: Process new leads for AI outreach (⏳ Not implemented)
  - `POST /webhook/twilio-sms`: Receive incoming SMS webhook (✅ Implemented - needs Twilio)

### Environment Variables
Create `.env` file in eugenia-backend/ with:
```
# Follow Up Boss Integration
FUB_API_KEY=
FUB_X_SYSTEM=
FUB_X_SYSTEM_KEY=
FUB_EUGENIA_TALKING_STATUS_FIELD_NAME=customEugeniaTalkingStatus
FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME=customAimAssist
FUB_USER_ID_FOR_AI=

# AI Integration
GEMINI_API_KEY=

# SMS Integration (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+18662981158  # Eugenia's phone number

# Database Integration (Airtable - future)
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_LEADS_TABLE_NAME=
AIRTABLE_MESSAGES_TABLE_NAME=

# Authentication
JWT_SECRET=your_secure_jwt_secret_here
ADMIN_PASSWORD_HASH=your_bcrypt_password_hash_here

# Agency Configuration
USER_AGENCY_NAME=Your Awesome Realty

# Error Tracking (Sentry)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Queue System (Redis)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Testing & Linting Commands
```bash
# Backend (if configured)
npm run lint
npm run typecheck

# Frontend
npm test
npm run lint

# Queue System Testing
node test-queue-system.js    # Test queue infrastructure
node monitor-queues.js       # Live queue monitoring dashboard

# Error Tracking Test
node test-sentry.js          # Verify Sentry integration
curl http://localhost:3001/debug-sentry  # Trigger test error
```
**IMPORTANT**: Always run linting commands after code changes per user requirements

## Key Integration Points
- **Follow Up Boss API**: Lead data is fetched real-time with no caching
  - SMS logging to FUB `/textMessages` endpoint for native conversation display
  - Phone validation with E.164 format support
  - Automatic phone number retrieval from lead records
- **Gemini AI**: Generates personalized nurturing messages based on lead context
  - CRITICAL: Context retention rules ensure AI remembers ALL conversation history
  - Auto-pause logic when leads request human assistance
  - Agency name personalization in all messages
- **Conversation History**: Tracked per lead for context-aware messaging
  - Fetches up to 500 messages from FUB for complete context
  - Falls back to frontend history if FUB fetch fails
  - WhatsApp-style UI for conversation display
- **Authentication**: JWT-based with 7-day expiration for persistent login
- **SMS Ready**: Twilio integration complete with phone number +18662981158
- **Queue System**: Bull Queue with Redis for reliable message processing
  - SMS queue with 45-second delay for natural conversation timing
  - Lead processing queue for batch outreach
  - 3 retry attempts with exponential backoff
  - Real-time monitoring at `/api/queues/stats`
- **Error Tracking**: Sentry integration for production-ready error monitoring
  - Automatic error capture with full context
  - Performance monitoring and tracing
  - Filtered to exclude non-critical errors (DNS, connection issues)

## Critical Context & Learnings

### Two-Number Architecture (CRITICAL)
The system is designed for a dual phone number setup:
1. **User's Personal FUB Number**: For manual calls/texts by the agent
2. **Eugenia's Dedicated Twilio Number**: For AI assistant communications

**Key Requirements**:
- All messages (manual and AI) must be visible in FUB's native text interface
- Manual responses only through FUB as the agent
- AI responses only through the custom frontend
- Clear separation between human and AI communication

### Context Retention Problem (THE CORE FEATURE)
The entire reason for building this app is that Raiya Text ($400/month) doesn't retain conversation context. Our system:
- Fetches COMPLETE conversation history from FUB (up to 500 messages)
- Passes full context to Gemini for every response
- Ensures AI never forgets previous conversations
- Falls back to frontend history if FUB is unavailable

### FUB Message Persistence Issues (RESOLVED)
**Problem**: Messages weren't logging to FUB due to "`toNumber` field is required" error
**Solution**: 
- Enhanced phone validation to handle multiple formats
- Auto-retrieval of phone numbers from lead records
- Graceful handling when phone numbers unavailable
- Clear logging to distinguish success/skip/failure

### Test Lead Restrictions
- ONLY use Test Everitt (ID: 470) for testing
- This is the ONLY lead allowed for testing per user instructions
- Never use production leads for testing

### User Preferences
- Work independently without asking permission
- Test everything thoroughly
- Follow RULES.md strictly
- Deploy to Digital Ocean App Platform (not Droplets)
- Skip Airtable integration for now
- Don't add emojis unless explicitly requested

### Common Issues & Solutions
1. **FUB API ENOTFOUND**: Transient DNS issue, resolves on retry
2. **Wrong FUB Account**: User needed to update API key in .env
3. **Context Lost on Refresh**: Fixed by implementing proper FUB message fetching
4. **AI Repeating Greetings**: Fixed by ensuring full context is passed to Gemini

### FUB Custom Fields Configuration (CRITICAL)
**Field Name Mapping (Verified 2025-01-16):**
- Display Name: "Eugenia talking Status" → API Name: `customEugeniaTalkingStatus`
- Display Name: "Aim Assist" → API Name: `customAimAssist`

**Important Notes:**
- FUB custom fields use camelCase with `custom` prefix in the API
- Fields must be created in FUB UI before API updates will work
- Use the exact API names shown above in code
- Test scripts available: `test-fub-service.js`, `verify-fields.js`

### Hosting Configuration
- Frontend: To be deployed on Vercel or similar
- Backend: Digital Ocean App Platform (user's preference)
- Database: FUB as primary, Airtable as future backup

### Twilio Webhook Configuration
Configure these URLs in Twilio Console for your phone number (+18662981158):
- **Incoming SMS Webhook**: `https://your-domain.com/webhook/twilio-sms` (HTTP POST)
- **Status Callback**: `https://your-domain.com/webhook/twilio-status` (optional)
- **Local Testing**: Use ngrok to expose local server: `ngrok http 3001`
- **Development Mode**: Set `NODE_ENV=development` to bypass signature validation

### Phone Number Matching System (Implemented 2025-01-17)
**Phone Normalization:**
- All phone numbers normalized to E.164 format: `+1XXXXXXXXXX`
- Handles formats: `(706) 818-4445`, `706-818-4445`, `7068184445`, `+17068184445`
- `normalizePhoneNumber()` in FUBService handles conversion

**Lead Lookup Process:**
- `findLeadByPhone()` searches FUB with multiple format variants
- Returns full lead object with custom fields or null if not found
- Unmatched numbers logged for manual review (notification system pending)

### Webhook Processing Flow (Implemented 2025-01-17)
When an SMS arrives at Eugenia's Twilio number:
1. Webhook validates signature (skipped in dev mode)
2. Looks up lead by phone number
3. Logs incoming message to FUB `/textMessages`
4. Checks if AI is paused (`customEugeniaTalkingStatus`)
5. Fetches full conversation history
6. Generates AI response with Gemini
7. Waits 45 seconds for natural timing
8. Sends response via Twilio
9. Logs outbound message to FUB
10. Updates lead status if escalation detected

### AI Prompt System (Implemented 2025-01-17)
**Prompt Management:**
- All prompts stored in `/prompts/isaPrompts.js` for easy editing
- Separate prompts for initial outreach vs ongoing conversations
- ISA-specific objectives and guidelines built into prompts

**Escalation Detection:**
- Automatic pause after 3 messages from lead
- Keyword detection for scheduling, human requests, opt-outs
- Expert question detection (financing, contracts, legal, etc.)
- Logs escalation reasons for debugging

**Context Retention:**
- Fetches up to 500 messages from FUB (with pagination)
- Formats recent 50 messages for AI context
- Includes lead profile, tags, source, and conversation metrics
- Never repeats questions already answered

### Lead Detection & Outreach System (Implemented 2025-01-17)
**Lead Detection Service:**
- Scans FUB for leads with "Direct Connect" or "PPC" tags (configurable)
- Eligibility checks: valid phone, AI not active, not contacted in 24hrs
- Batch processing with safety limits (max 5 leads at once)
- `/api/initiate-ai-outreach` endpoint triggers the process

**Initial Outreach Flow:**
1. Scan for eligible leads based on tags
2. Generate personalized initial message
3. Send SMS via Twilio
4. Log message to FUB
5. Update lead custom fields:
   - `customEugeniaTalkingStatus` → "active"
   - `customAimAssist` → conversation URL
6. Generate clickable link: `http://localhost:3000/conversation/{leadId}`

**Safety Features:**
- Maximum 5 leads processed per batch
- 1-second delay between outreach attempts
- Comprehensive error handling per lead
- Detailed success/failure reporting

### Production Infrastructure (Implemented 2025-01-18)
**Queue System with Bull & Redis:**
- Implemented Bull Queue for reliable message processing
- Redis backend for queue persistence (installed via Homebrew)
- SMS Queue: 45-second delay for natural conversation timing
- Lead Queue: Batch processing with lower concurrency
- Automatic retries: 3 attempts with exponential backoff
- Queue monitoring endpoint: `/api/queues/stats`
- Test scripts: `test-queue-system.js`, `monitor-queues.js`

**Error Tracking with Sentry:**
- Full Sentry integration using latest Express setup
- `instrument.js` initializes Sentry before app startup
- Automatic error capture with context and stack traces
- Performance monitoring and transaction tracing
- Test endpoint: `/debug-sentry` for verification
- Filtered non-critical errors (DNS, connection issues)

**Benefits of Infrastructure Updates:**
1. **Reliability**: Messages persisted in Redis, survive server crashes
2. **Natural Timing**: 45-second delay makes AI responses feel human
3. **Error Recovery**: Automatic retries handle transient failures
4. **Observability**: Real-time queue stats and error tracking
5. **Scalability**: Concurrent message processing with worker pools
6. **Production Ready**: Professional error handling and monitoring