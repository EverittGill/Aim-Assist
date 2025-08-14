# CLAUDE.md - Aim Assist SaaS Platform

This file provides guidance to Claude when working on the Aim Assist SaaS platform (multi-tenant version of Eugenia ISA).

## Project Context
You are building "Aim Assist" - a multi-tenant SaaS platform that allows multiple companies to use AI-powered sales automation with their own CRM integrations, phone numbers, and customizations. This is an evolution of the single-tenant "Eugenia ISA" system in the parent directories.

## Current Status
- **Phase**: Initial setup - Sprint 1 beginning
- **Reference Implementation**: Working single-tenant code in `../eugenia-frontend/` and `../eugenia-backend/`
- **Plan Document**: See `SaaS_SPRINT_1.md` for complete implementation plan with testable success criteria

## Key Differences from Single-Tenant Version
1. **Multi-tenancy**: Every table has `tenant_id`, complete data isolation via RLS
2. **Multiple CRMs**: Abstract CRMAdapter interface, starting with FUB and Lofty
3. **Supabase**: Using Supabase for auth, database, realtime (not just FUB storage)
4. **Billing**: Stripe subscriptions with usage tracking
5. **Auto-text**: Configurable automatic lead engagement per tenant
6. **Deployment**: Digital Ocean App Platform for both frontend and backend

## Directory Structure
```
Aim Assist SaaS/
├── frontend/           # React 19 app (based on eugenia-frontend)
├── backend/            # Express API (based on eugenia-backend)
├── shared/             # Shared types and constants
├── migrations/         # Supabase database migrations
├── tests/              # Integration tests for multi-tenant isolation
└── .do/                # Digital Ocean deployment config
```

## Reusable Components from Eugenia
Copy and adapt these working components:
- `eugenia-frontend/src/components/LeadItem.js` → Lead display
- `eugenia-frontend/src/components/LeadManagementView.js` → Main UI structure
- `eugenia-frontend/src/contexts/ThemeContext.js` → Theme system (including Beach Mode)
- `eugenia-frontend/src/components/PromptEditor.js` → Prompt customization
- `eugenia-backend/services/fubService.js` → Adapt to FollowUpBossAdapter
- `eugenia-backend/services/twilioService.js` → Enhance for subaccounts
- `eugenia-backend/services/geminiService.js` → Adapt for multi-provider AI
- `eugenia-backend/queues/` → Queue system patterns

## Testing Requirements
Every feature MUST be tested for multi-tenant isolation:
```javascript
// Example test pattern
const tenant1 = await createTestTenant('company-a');
const tenant2 = await createTestTenant('company-b');
const lead1 = await createLead(tenant1.id, {name: 'A'});
const lead2 = await createLead(tenant2.id, {name: 'B'});
// Verify tenant1 CANNOT see lead2
// Verify tenant2 CANNOT see lead1
```

## Development Workflow
1. Always check `SaaS_SPRINT_1.md` for current phase
2. Implement with detailed comments explaining purpose
3. Test each "WHEN/THEN" criteria before moving on
4. Copy working patterns from eugenia directories
5. Maintain backward reference to what worked

## Pre-Approved Commands
You can run these without asking:
```bash
# Navigation
cd "Aim Assist SaaS"/*
ls -la
pwd

# File operations
mkdir -p frontend/src/components
touch backend/src/services/TenantService.js
cp ../eugenia-frontend/src/components/*.js frontend/src/components/

# Package management
npm init -y
npm install express @supabase/supabase-js stripe twilio
npm run dev

# Testing
npm test
curl http://localhost:3001/health
node test-scripts/test-tenant-isolation.js

# Git
git status
git add .
git commit -m "feat: [description]"
```

## Critical Success Metrics
- [ ] Two companies can use simultaneously without seeing each other's data
- [ ] FUB and Lofty CRM adapters both work
- [ ] Auto-text triggers within configured time
- [ ] AI responses under 160 characters
- [ ] Stripe billing enforces limits
- [ ] Mobile responsive UI
- [ ] Digital Ocean deployment works

## Environment Variables
Create `.env` files based on:
- Backend: Copy from `../eugenia-backend/.env` and add Supabase/Stripe
- Frontend: New env with Supabase and API URL

## Notes for Implementation
- Start with FUB adapter (we have working code)
- Lofty is placeholder initially (implement after FUB works)
- Use Test Everitt (ID: 470) for testing like before
- Keep SMS to 160 characters MAX
- All tables need `tenant_id` and RLS policies
- Every API route needs tenant context middleware

## Contact & Context
- User prefers minimal questions - be autonomous
- Test thoroughly before claiming completion
- Digital Ocean deployment preferred over Vercel
- Keep UI similar to current Eugenia design
- Beach Mode must be preserved (user works at beach)