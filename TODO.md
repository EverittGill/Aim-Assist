# Eugenia ISA - Development Todo List

## Overview
This file tracks the development progress of the Eugenia ISA project based on the PRD requirements.
Each task includes:
- Status: ✅ Completed | 🔄 In Progress | ⏳ Not Started
- Priority: 🔴 High | 🟡 Medium | 🟢 Low
- Context notes for future development sessions

Last Updated: 2025-01-13

---

## Frontend Tasks

### UI/UX Implementation

- [x] **Create Navigation Bar** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/components/NavBar.js`
  - Notes: Basic nav with "Aim Assist" title and settings button. Ready for future nav items.

- [x] **Lead List Display** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/components/LeadItem.js`
  - Notes: Shows lead name, status badge, source, tags, and last contacted time. Click to select.

- [x] **Selected Lead Details Panel** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/components/SelectedLeadDetails.js`
  - Notes: Chat-style UI with message history, AI/lead message differentiation, manual message input.

- [x] **Settings Panel** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/components/SettingsPanel.js`
  - Notes: Stores Gemini API key and agency name in localStorage. Shows backend config status.

- [x] **Add Lead Modal** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/components/AddLeadModal.js`
  - Notes: Form to add new leads with name, email, phone, status, and notes.

- [ ] **Migrate to Reactbits Components** 🟡
  - Status: ⏳ Not Started
  - Notes: PRD specifies using prebuilt components from reactbits.dev. Need to:
    1. Install Reactbits package
    2. Replace current components with Reactbits equivalents
    3. Maintain simple, elegant UI with muted colors

- [x] **Implement URL-based Lead Navigation** 🔴
  - Status: ✅ Completed (2025-01-13)
  - Notes: 
    - Installed react-router-dom
    - Created AppWithRouter component with routes: "/" and "/conversation/:leadId"
    - Added useParams and useNavigate hooks for URL handling
    - Auto-selects lead when accessing direct URLs
    - Navigates to home if lead ID doesn't exist
    - Refactored App.js to use LeadManagementView component (under 300 lines rule)
    - Fixed eslint warnings in components

- [x] **Add AI Pause/Resume Controls** 🔴
  - Status: ✅ Completed (2025-01-13)
  - Notes: 
    - Enhanced SelectedLeadDetails component with AI status display
    - Added pause/resume toggle button with icons (Play/Pause)
    - AI status determined from lead status or tags containing "paused"
    - handleToggleAIPause function updates lead status locally
    - Visual indicators: Green for Active, Yellow for Paused
    - Integrated with existing action progress states
    - Ready for backend FUB API integration (marked with TODO)

### Frontend API Integration

- [x] **Fetch Leads from Backend** 🟢
  - Status: ✅ Completed
  - File: `eugenia-frontend/src/services/apiService.js`
  - Notes: `fetchLeads()` function working, fetches from backend `/api/leads`

- [ ] **Create Lead API Integration** 🔴
  - Status: ⏳ Not Started
  - File: `eugenia-frontend/src/services/apiService.js`
  - Notes: `createLead()` function exists but backend endpoint not implemented

- [ ] **Delete Lead API Integration** 🔴
  - Status: ⏳ Not Started
  - File: `eugenia-frontend/src/services/apiService.js`
  - Notes: `deleteLead()` function exists but backend endpoint not implemented

- [ ] **Send AI Message API Integration** 🔴
  - Status: ⏳ Not Started
  - Notes: Move Gemini API calls from frontend to backend for security

- [ ] **Log Incoming Message API Integration** 🔴
  - Status: ⏳ Not Started
  - Notes: Handle incoming SMS webhook data display

### Security & Architecture

- [x] **Remove Gemini API Key from Frontend** 🔴
  - Status: ✅ Completed (2025-01-13)
  - Notes: 
    - Moved Gemini API integration to backend with new endpoints:
      - POST /api/generate-initial-message
      - POST /api/generate-reply
    - Created GeminiService class in backend/services/geminiService.js
    - Removed geminiApiKey from frontend state and localStorage
    - Updated SettingsPanel to only show agency name configuration
    - Frontend now passes agency name with API requests
    - Backend uses Gemini API key from .env file
    - Includes auto-pause detection for keywords like "schedule a call", "stop", etc.

---

## Backend Tasks

### Core API Endpoints

- [x] **GET /api/leads - Fetch Leads from FUB** 🟢
  - Status: ✅ Completed
  - File: `eugenia-backend/server.js` (lines 20-104)
  - Notes: Fetches up to 25 leads, transforms FUB data, includes custom fields and tags

- [ ] **POST /api/leads - Create Lead in FUB** 🔴
  - Status: ⏳ Not Started
  - Notes: Need to implement FUB POST to /people endpoint
  - Include custom field for Eugenia conversation URL

- [ ] **DELETE /api/leads/:id - Delete Lead from FUB** 🔴
  - Status: ⏳ Not Started
  - Notes: Implement FUB DELETE to /people/:id endpoint

- [ ] **POST /api/send-ai-message - Send SMS via Twilio** 🔴
  - Status: ⏳ Not Started
  - Notes: 
    1. Install Twilio SDK
    2. Send SMS via Twilio
    3. Log to FUB /textMessages endpoint
    4. Update Airtable backup
    5. Return success/error to frontend

- [ ] **POST /api/log-incoming-message - Process Incoming SMS** 🔴
  - Status: ⏳ Not Started
  - Notes:
    1. Receive lead phone and message
    2. Look up lead in FUB
    3. Log to FUB /textMessages
    4. Generate AI response via Gemini
    5. Check for auto-pause keywords
    6. Send response if not paused

- [ ] **POST /api/initiate-ai-outreach - Process New Leads** 🔴
  - Status: ⏳ Not Started
  - Notes:
    1. Identify new leads without Eugenia URL
    2. Generate initial message via Gemini
    3. Send via Twilio
    4. Generate unique URL
    5. Update FUB custom field with URL
    6. Log everything

- [ ] **POST /webhook/twilio-sms - Twilio Webhook** 🔴
  - Status: ⏳ Not Started
  - Notes:
    1. Validate Twilio signature for security
    2. Extract message data
    3. Call /api/log-incoming-message internally

### Third-Party Integrations

- [ ] **Complete FUB Integration** 🔴
  - Status: ⏳ Not Started
  - Notes: Need to implement:
    - Update lead status/tags (PUT /people/:id)
    - Log to texting UI (POST /textMessages)
    - Update custom fields for Eugenia URL
    - Handle rate limits and errors

- [x] **Twilio Integration** 🔴
  - Status: ✅ Completed (2025-01-13)
  - Notes:
    - Installed twilio package
    - Created TwilioService class in backend/services/twilioService.js
    - Added SMS sending functionality with error handling
    - Implemented webhook signature validation methods
    - Added Twilio webhook endpoint: POST /webhook/twilio-sms
    - Added API endpoints:
      - POST /api/send-ai-message (sends SMS via Twilio)
      - Enhanced /api/log-incoming-message for SMS processing
    - Server automatically initializes Twilio if credentials are configured

- [ ] **Move Gemini Integration to Backend** 🔴
  - Status: ⏳ Not Started
  - Notes:
    1. Install @google/generative-ai package
    2. Create Gemini service module
    3. Implement prompt engineering for ISA personality
    4. Add auto-pause detection logic

- [ ] **Airtable Integration** 🔴
  - Status: ⏳ Not Started
  - Notes:
    1. Install airtable package
    2. Create Leads table structure
    3. Create Messages table structure
    4. Implement backup logging functions
    5. Handle Airtable API limits

### Automation & State Management

- [ ] **Lead State Management System** 🔴
  - Status: ⏳ Not Started
  - Notes: Track AI status (Active/Paused) per lead
  - Store in FUB custom fields or tags

- [ ] **New Lead Engagement Automation** 🔴
  - Status: ⏳ Not Started
  - Notes: Can be manual trigger initially, add cron job later

- [ ] **Auto-Pause Logic Implementation** 🔴
  - Status: ⏳ Not Started
  - Notes: Detect keywords like "yes, call me", "stop", "unsubscribe"
  - Update lead status automatically

### Security & Infrastructure

- [ ] **Add Request Validation** 🟡
  - Status: ⏳ Not Started
  - Notes: Validate all incoming requests, sanitize inputs

- [ ] **Implement Rate Limiting** 🟡
  - Status: ⏳ Not Started
  - Notes: Protect API endpoints from abuse

- [ ] **Add Basic Authentication** 🔴
  - Status: ⏳ Not Started
  - Notes: Simple auth for frontend access (can be basic auth initially)

---

## Deployment & DevOps

- [ ] **Frontend Deployment Setup** 🟡
  - Status: ⏳ Not Started
  - Platform: Netlify or Vercel
  - Notes: Set up CI/CD, environment variables

- [ ] **Backend Deployment Setup** 🟡
  - Status: ⏳ Not Started
  - Platform: Render or Heroku
  - Notes: Configure environment variables, set up logging

- [ ] **Domain & SSL Setup** 🟡
  - Status: ⏳ Not Started
  - Notes: Configure custom domain for unique lead URLs

---

## Testing & Documentation

- [ ] **API Endpoint Testing** 🟡
  - Status: ⏳ Not Started
  - Notes: Add Jest tests for all endpoints

- [ ] **Update CLAUDE.md with New Features** 🟢
  - Status: ⏳ Not Started
  - Notes: Document new endpoints, integrations as they're built

- [ ] **Create User Documentation** 🟢
  - Status: ⏳ Not Started
  - Notes: How to use the system, webhook setup, etc.

---

## Phase 2 Features (Post-MVP)

- [ ] **AI Voice Calling** 🟢
  - Status: ⏳ Not Started
  - Notes: Twilio Voice integration

- [ ] **Multi-User Support** 🟢
  - Status: ⏳ Not Started
  - Notes: User accounts, isolated data

- [ ] **Analytics Dashboard** 🟢
  - Status: ⏳ Not Started
  - Notes: Engagement metrics, success rates

- [ ] **Advanced Nurturing Sequences** 🟢
  - Status: ⏳ Not Started
  - Notes: Complex drip campaigns

---

## Next Steps Priority Order

1. **Backend Security**: Move Gemini API to backend
2. **URL Routing**: Implement `/conversation/[FUB_LEAD_ID]` navigation
3. **Twilio Integration**: Set up SMS sending/receiving
4. **FUB Communication Logging**: Implement /textMessages logging
5. **AI Pause Controls**: Add pause/resume functionality
6. **Airtable Backup**: Implement backup logging
7. **Reactbits Migration**: Update UI components
8. **Deployment**: Set up production environment

---

## Development Notes

- Always test with real FUB sandbox account before production
- Maintain backward compatibility with existing lead data
- Focus on reliability over features for MVP
- Keep UI simple and elegant per PRD requirements