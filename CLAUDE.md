# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**IMPORTANT**: When starting a new session, read this file first to understand the project context, recent work, and critical requirements.

## Project Overview
Eugenia ISA (Inside Sales Agent) is a full-stack real estate lead management system with AI-powered lead nurturing capabilities. It integrates with Follow Up Boss CRM and uses Google Gemini AI for generating personalized messages.

## Commands

### Quick Start (Recommended)
```bash
# From project root directory
./start-eugenia.sh   # Starts both frontend and backend automatically
```

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

### Troubleshooting Connection Issues
If frontend can't connect to backend:
1. Ensure `.env` or `.env.local` exists in `eugenia-frontend/` with:
   ```
   REACT_APP_API_URL=http://localhost:3001/api
   ```
2. Restart the frontend after creating/updating the .env file
3. Verify backend is running on port 3001

## Architecture

### Frontend
- **React 19.1.0** application with Create React App
- **Tailwind CSS + DaisyUI** for styling with custom theme system
- **Theme System**: Three themes - Light (warm tan/caramel), Dark, and Beach Mode (high contrast for sunlight)
  - Theme context in `src/contexts/ThemeContext.js` with localStorage persistence
  - Custom DaisyUI themes defined in `tailwind.config.js` and `src/daisyui-themes.css`
  - Beach Mode: Pure yellow (#FFFF00) background with black text for maximum sunlight readability
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
GEMINI_TEMPERATURE=0.7          # 0.1-1.0: Lower = consistent, Higher = creative (default: 0.7)
GEMINI_TOP_K=40                 # Number of tokens to consider (default: 40)
GEMINI_TOP_P=0.9                # Cumulative probability threshold (default: 0.9)
GEMINI_MAX_TOKENS=256           # Max response length in tokens (default: 256)

# SMS Integration (Twilio)
TWILIO_ACCOUNT_SID=ACd3662d43b55d8fc8014b95529df92c77
TWILIO_AUTH_TOKEN=cc0a304d764c9a17e73a10c83cd41ef9
TWILIO_FROM_NUMBER=+18662981158  # Eugenia's toll-free verified number
USER_NOTIFICATION_PHONE=+19047805602  # Your phone for qualified lead alerts
ALLOW_DEV_SMS=true  # Set to true to actually send SMS in development mode

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
  - **3-Message Alert System**:
    - Development mode: No limits for testing
    - Production: After 3 lead messages, sends SMS alert to agent
    - 2-hour auto-pause allows direct agent contact with engaged leads
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

### Twilio Webhook Configuration (UPDATED 2025-01-20)
**Phone Number**: +18662981158 (Toll-free, SMS capable, Verified)

Configure these URLs in Twilio Console:
- **Development (ngrok)**: `https://[your-ngrok-subdomain].ngrok.io/webhook/twilio-sms`
- **Production**: `https://[your-app-name]-backend.ondigitalocean.app/webhook/twilio-sms`
- **HTTP Method**: POST
- **Status Callback**: Optional

**Local Testing Quick Start**:
1. Start backend: `cd eugenia-backend && npm start`
2. Start ngrok: `ngrok http 3001`
3. Copy HTTPS URL from ngrok output
4. Configure in Twilio Console under Phone Numbers → +18662981158
5. Test with SMS from +17068184445 to +18662981158

**Development Mode**: `NODE_ENV=development` bypasses signature validation

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

### Theme System Implementation (Added 2025-01-18)
**Beach Mode Feature**: Created for maximum readability when using the app in direct sunlight
- **Problem**: User often works at the beach with intense sunlight on screen
- **Solution**: Implemented 3-theme system with special "Beach Mode"
  
**Technical Implementation**:
1. **Theme Context** (`src/contexts/ThemeContext.js`):
   - Manages theme state with localStorage persistence
   - Cycles through: Light → Dark → Beach → Light
   - Provides `toggleTheme()` and theme state flags

2. **Custom DaisyUI Configuration**:
   - Fixed DaisyUI not loading in CRA by creating `src/daisyui-themes.css`
   - Defined custom themes in `tailwind.config.js` (separated into array items)
   - Beach Mode uses pure yellow (#FFFF00) background with black text

3. **Beach Mode Specific Enhancements** (`src/App.css`):
   - 120% base font size, all text bold (700+ font-weight)
   - Extra large buttons with 3px black borders
   - Removed all shadows, gradients, and decorative elements
   - Timestamps appear inline next to sender name (not below message)
   - Wider scrollbars (16px) with high contrast

4. **Search Bar Fix** (`src/search-fix.css`):
   - Fixed magnifying glass icon overlap with proper padding
   - Ensured consistent styling across all themes
   - Beach mode: 2px black border on yellow background

**Files Modified**:
- `src/contexts/ThemeContext.js` - Theme state management
- `src/components/NavBar.js` - Theme toggle button with dynamic icons
- `src/daisyui-themes.css` - Custom theme definitions and base styles
- `src/App.css` - Beach mode specific overrides
- `src/search-fix.css` - Search input styling fixes
- `tailwind.config.js` - DaisyUI theme configuration

### Development Mode System (Added 2025-01-20)
**Purpose**: Allow unlimited testing on specific leads without production restrictions

**Implementation**:
1. **Frontend Toggle** (`src/components/SettingsPanel.js`):
   - Toggle switch for lead 470 in settings panel
   - Shows active features when enabled
   - Persists state to localStorage

2. **Backend Service** (`services/devModeService.js`):
   - Tracks per-lead dev mode status
   - Auto-enables for lead 470 in development environment
   - API endpoints: `/api/dev-mode` (POST), `/api/dev-mode/:leadId` (GET)

3. **Integration Points**:
   - `geminiService.js`: Bypasses 3-message limit check
   - `notificationService.js`: Skips SMS notifications
   - `twilioService.js`: Actually sends SMS when `ALLOW_DEV_SMS=true`

**Console Indicators**:
- `🛠️ Dev mode auto-enabled for Test Lead 470` on server start
- `🛠️ [DEV MODE] Message limit check bypassed` when processing messages
- `📱 [DEV MODE] Would send notification` when notifications skipped

### Recent Fixes (2025-01-20)
1. **Gemini Response Issue**: Fixed empty responses by:
   - Changing model from `gemini-2.5-flash` to `gemini-2.0-flash-exp`
   - Setting appropriate `GEMINI_MAX_TOKENS=1000` in .env
   - Optimizing custom prompt from ~1,600 to ~420 characters
   - Removing unnecessary 85+ tag list from prompts
2. **Custom Prompt Loading**: Verified custom prompts in `customPrompts.json` are properly loaded and used
3. **Conversation Context**: Confirmed full conversation history is passed to Gemini for context-aware responses

### Recent Fixes (2025-01-20 - Earlier)
1. **Template Interpolation**: Fixed `${leadDetails.firstName}` variables not being replaced
2. **Connection Issues**: Created `.env.local` and startup script for consistent localhost connections
3. **Message Limit Logic**: Changed from "all-time" to "2-hour rolling window"
4. **Prompt Persistence**: Fixed saving custom prompts to backend
5. **Lead Context**: Ensured full lead details passed to Gemini (name, tags, source, etc.)
6. **Temperature Control**: Added Gemini temperature configuration via environment variables
7. **SMS Length Validation**: Added 1600 character limit validation to prevent Twilio errors
8. **Conversation History Cleanup**: Created utilities to clear FUB conversation history

### Qualification-Based Auto-Stop System (Implemented 2025-01-20)
**Replaced 3-Message Limit with Intelligent Qualification Tracking**

**QualificationService** (`services/qualificationService.js`):
- Tracks answers to 3 key qualifying questions:
  - Timeline to move
  - Agent status (working with another agent)
  - Financing (pre-approved or cash)
- Detects phone interest keywords ("call me", "phone call", etc.)
- Detects scheduling interest ("schedule", "appointment", "showing", etc.)
- Automatically determines when a lead is qualified based on:
  - Answering all 3 qualifying questions
  - Expressing interest in a phone call
  - Wanting to schedule a showing/meeting
  - High engagement (2+ questions answered with 4+ messages)

**Eugenia Follow-up Messages**:
When qualification is complete, Eugenia sends a personalized follow-up:
- Phone interest: "Perfect [name]! Everitt will give you a call shortly..."
- Scheduling interest: "Excellent [name]! Everitt will reach out to schedule that for you..."
- General qualification: "Thanks for all that info [name]! Everitt will be calling you shortly..."

**Agent Notifications**:
- SMS sent to USER_NOTIFICATION_PHONE when lead qualifies
- Includes lead name, phone, and qualification reason
- Highest priority queue delivery

**Integration**:
- `geminiService.js` uses qualification status instead of message count
- Webhook and AI routes handle qualification completion
- Frontend displays qualification messages and follow-up
- FUB custom fields track qualification status (when fields exist)

### Cleanup Utilities (Added 2025-01-20)
**Lead Cleanup Scripts** in `eugenia-backend/`:
- `cleanup-lead.js` - Complete cleanup (history + status)
- `clear-conversation.js` - Clear conversation history only
- `reset-lead-status.js` - Reset status fields only

**Usage**:
```bash
cd eugenia-backend
npm run cleanup:test     # Clean Test Everitt (lead 470)
npm run cleanup -- 123   # Clean any lead by ID
npm run clear:history    # Clear conversation history
npm run reset:status     # Reset status fields
```

### Current Status (2025-01-20)

#### Working Features
- **AI Conversations**: Gemini 2.0 Flash generating contextual responses ✅
- **Conversation Memory**: Full history passed to AI for context retention ✅
- **Custom Prompts**: Editable prompts in `customPrompts.json` ✅
- **SMS Length**: Responses stay under 160 characters ✅
- **Lead Qualification**: Tracks timeline, agent status, and financing ✅

#### Known Issues
- **Response Style**: Eugenia's responses are somewhat robotic and repetitive
  - Starts every message with "Hi [name], Eugenia here!"
  - Asks too many questions at once
  - Needs prompt refinement for more natural conversation

#### Gemini Configuration (RESOLVED)
**Issue**: Empty responses with `finishReason: MAX_TOKENS`
**Root Cause**: 
- Wrong model name (`gemini-2.5-flash` → `gemini-2.0-flash-exp`)
- Token limits vs prompt length mismatch
- Custom prompt not being loaded properly

**Solution**:
- Updated to `gemini-2.0-flash-exp` model
- Set `GEMINI_MAX_TOKENS=1000` in .env
- Optimized custom prompt from ~1,600 to ~420 characters
- Removed unnecessary 85+ tag list from prompt

**Key Settings**:
- Model: `gemini-2.0-flash-exp`
- Max Output Tokens: 1000
- Temperature: 0.7
- Custom prompt: ~420 characters

## How This Project Works

### System Overview
Eugenia ISA is a sophisticated AI-powered inside sales assistant that integrates with Follow Up Boss CRM to provide intelligent lead nurturing through SMS conversations. The system maintains full conversation context (unlike competitors like Raiya Text) and provides natural, personalized responses.

**Architecture Flow:**
```
Lead Source → FUB CRM → Eugenia Backend → AI Processing → SMS Delivery
     ↑                         ↓                              ↓
     └─────── Lead Updates ────┴──────── Twilio Webhook ─────┘
```

### Core Components

#### Frontend (React SPA)
- **Entry Point**: `App.js` wrapped with `AuthWrapper` for JWT authentication
- **Main Views**:
  - Lead list with search/filter capabilities
  - Conversation view with WhatsApp-style messaging
  - Settings panel with agency name and dev mode toggle
  - Prompt editor for customizing AI responses
- **Services**:
  - `apiService.js`: All backend API calls
  - `geminiService.js`: Direct Gemini integration (unused in production)
- **Theme System**: Light/Dark/Beach modes with Beach Mode optimized for sunlight

#### Backend (Express Server)
- **Entry**: `server.js` initializes all services and routes
- **Service Layer**:
  - `FUBService`: Lead CRUD, phone validation, message logging to FUB
  - `GeminiService`: AI text generation with full context awareness
  - `TwilioService`: SMS sending/receiving with queue integration
  - `ConversationService`: Fetches complete conversation history
  - `NotificationService`: Agent alerts and pause scheduling
  - `PromptService`: Template interpolation for dynamic prompts
  - `DevModeService`: Per-lead development mode management
  - `MessageStorageService`: JSON storage in FUB notes field
  - `LeadDetectionService`: Scans for new leads to contact
- **Queue System**: Bull Queue with Redis for reliable, delayed message processing
- **Error Tracking**: Sentry integration for production monitoring

### Key Workflows

#### A. Incoming SMS Flow (Via Twilio Webhook)
When a lead texts Eugenia's Twilio number (+18662981158):

1. **Webhook Receipt** (`/webhook/twilio-sms`):
   - Validates Twilio signature (skipped in dev mode)
   - Parses SMS data from URL-encoded body

2. **Lead Identification**:
   - Normalizes phone to E.164 format (+1XXXXXXXXXX)
   - Searches FUB with multiple format variants
   - Returns 200 OK even if lead not found (prevents retries)

3. **Message Storage**:
   - Stores in FUB notes field as JSON (always succeeds)
   - Attempts to log to FUB `/textMessages` API (may fail without permissions)

4. **AI Pause Checks**:
   - Permanent pause: `customEugeniaTalkingStatus === 'inactive'`
   - Temporary pause: Checks `customEugeniaPausedUntil` timestamp
   - Dev mode: Bypasses all pause checks for lead 470

5. **Context Building**:
   - Fetches up to 500 messages from FUB conversation history
   - Includes full lead profile (name, tags, source, custom fields)
   - Formats messages chronologically for AI context

6. **AI Response Generation**:
   - Calls `geminiService.generateReply()` with full context
   - Uses custom prompts from `customPrompts.json`
   - Temperature controlled via environment variable

7. **Message Limit Handling**:
   - Counts lead messages in 2-hour rolling window
   - At 3 messages: Sends SMS alert to agent
   - Schedules 2-hour pause (production only)

8. **Response Queuing**:
   - Queues SMS with 45-second delay for natural timing
   - Higher priority (1) for responses vs outreach (2)
   - Stores job in Redis for reliability

9. **Status Updates**:
   - Updates `customEugeniaTalkingStatus` if escalation detected
   - Logs all actions with detailed console output

#### B. Frontend-Initiated Message Flow
When agent types a lead response in the UI:

1. **Message Submission**:
   - Frontend calls `POST /api/log-incoming-message`
   - Includes lead ID, message, and current conversation

2. **Backend Processing**:
   - Stores message in FUB notes (primary storage)
   - Attempts FUB text message logging (secondary)
   - Checks AI pause status

3. **Context Enhancement**:
   - If available, fetches fresh FUB conversation history
   - Otherwise uses frontend-provided history
   - Merges with full lead profile data

4. **AI Generation**:
   - Same process as webhook flow
   - Returns response immediately to frontend

5. **User Action Required**:
   - Frontend displays AI response with "Send" button
   - User must explicitly click to send (not automatic)

6. **SMS Delivery**:
   - `POST /api/send-ai-message` called on button click
   - Validates Eugenia isn't paused
   - Queues SMS for immediate delivery
   - Logs to FUB after sending

#### C. Automated Lead Outreach Flow
For new leads from specific sources:

1. **Detection** (`POST /api/initiate-ai-outreach`):
   - Scans FUB for leads with "Direct Connect" or "PPC" tags
   - Filters by: valid phone, AI not active, no contact in 24hrs
   - Limits to 5 leads per batch for safety

2. **Message Generation**:
   - Uses `generateInitialOutreach()` with lead context
   - Personalizes based on lead source and tags
   - Agency name inserted from environment

3. **Bulk Processing**:
   - 1-second delay between each lead
   - Queues all messages with priority 2
   - Updates each lead's status to "active"

4. **Field Updates**:
   - Sets `customEugeniaTalkingStatus` to "active"
   - Sets `customAimAssist` to conversation URL
   - Creates clickable link for agent access

### Critical Design Decisions

#### 1. Context Retention Strategy
**Problem**: Competitors lose conversation history between messages
**Solution**: 
- Fetch COMPLETE history from FUB (up to 500 messages)
- Store all messages in FUB notes field as JSON backup
- Pass entire context to Gemini for every response
- Never rely on session state or memory

#### 2. Message Storage Architecture
**Primary Storage**: FUB notes field with JSON structure
```json
{
  "conversations": [
    {
      "id": "msg_123",
      "direction": "inbound|outbound",
      "type": "sms|ai",
      "content": "message text",
      "timestamp": "2025-01-20T10:30:00Z"
    }
  ],
  "metadata": {
    "lastUpdated": "2025-01-20T10:30:00Z",
    "messageCount": 42
  }
}
```
**Secondary Storage**: FUB text messages API (when available)

#### 3. Phone Number Normalization
All phone numbers converted to E.164 format:
- Input: `(706) 818-4445`, `706-818-4445`, `7068184445`
- Output: `+17068184445`
- Search attempts multiple formats for backward compatibility

#### 4. Queue System Design
**Why Queues**: 
- Natural conversation timing (45-second delays)
- Reliability (survives server crashes)
- Rate limiting and retry logic
- Priority handling (responses > outreach)

**Implementation**:
- Bull Queue with Redis backend
- 3 retry attempts with exponential backoff
- Separate queues for SMS and lead processing
- Real-time monitoring via `/api/queues/stats`

#### 5. Development Mode
**Purpose**: Unrestricted testing on specific leads
**Features**:
- No message limits or pauses
- Full SMS sending (with `ALLOW_DEV_SMS=true`)
- Detailed console logging
- Auto-enabled for lead 470 in development

### Environment Configuration

#### Required Services
1. **Follow Up Boss**: CRM for lead data
2. **Google Gemini**: AI text generation
3. **Twilio**: SMS sending/receiving
4. **Redis**: Queue persistence (local or cloud)
5. **Sentry**: Error tracking (optional)

#### Key Environment Variables
```bash
# Follow Up Boss
FUB_API_KEY=                    # Required for all FUB operations
FUB_EUGENIA_TALKING_STATUS_FIELD_NAME=customEugeniaTalkingStatus
FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME=customAimAssist

# AI Configuration
GEMINI_API_KEY=                 # Required for AI features
GEMINI_TEMPERATURE=0.7          # 0.1-1.0 (lower=consistent)

# SMS Configuration
TWILIO_ACCOUNT_SID=             # Required for SMS
TWILIO_AUTH_TOKEN=              # Required for SMS
TWILIO_FROM_NUMBER=+18662981158 # Eugenia's number
USER_NOTIFICATION_PHONE=+1XXX   # Agent's phone for alerts
ALLOW_DEV_SMS=true              # Enable SMS in development

# Authentication
JWT_SECRET=                     # Required for login
ADMIN_PASSWORD_HASH=            # Bcrypt hash of password
```

### Security Considerations

1. **Authentication**: JWT tokens with 7-day expiration
2. **Webhook Validation**: Twilio signature verification (production)
3. **Rate Limiting**: Queue system prevents abuse
4. **Data Privacy**: No lead data cached locally
5. **Error Handling**: Graceful failures with detailed logging

### Production Deployment

1. **Frontend**: Deploy to Vercel or similar CDN
2. **Backend**: Digital Ocean App Platform (user preference)
3. **Redis**: Use managed Redis service
4. **Monitoring**: Sentry for errors, queue stats for health
5. **Scaling**: Increase queue workers for higher volume

### Testing Guidelines

1. **Test Lead**: Only use Test Everitt (ID: 470)
2. **Dev Mode**: Toggle in settings for unrestricted testing
3. **Console Logs**: Detailed output for debugging
4. **Queue Monitor**: Check `/api/queues/stats` for job status
5. **Startup Script**: Use `./start-eugenia.sh` to avoid port conflicts