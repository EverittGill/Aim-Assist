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
FUB_EUGENIA_TALKING_STATUS_FIELD_NAME=eugenia_talking_status
FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME=eugenia_conversation_link
FUB_USER_ID_FOR_AI=

# AI Integration
GEMINI_API_KEY=

# SMS Integration (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

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
```

## Testing & Linting Commands
```bash
# Backend (if configured)
npm run lint
npm run typecheck

# Frontend
npm test
npm run lint
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
- **SMS Ready**: Twilio integration prepared but credentials not yet configured

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

### Hosting Configuration
- Frontend: To be deployed on Vercel or similar
- Backend: Digital Ocean App Platform (user's preference)
- Database: FUB as primary, Airtable as future backup