# Aim Assist SaaS Platform - Sprint 1 Implementation Plan

## Project Overview
Build "Aim Assist" - a multi-tenant AI-powered sales assistant platform supporting multiple CRMs, starting with Follow Up Boss and Lofty.

## Directory Structure
```
/Users/everittgill/Desktop/ISA project/
├── eugenia-frontend/          # Current frontend (reference)
├── eugenia-backend/           # Current backend (reference)
└── Aim Assist SaaS/          # NEW PROJECT
    ├── frontend/
    ├── backend/
    ├── shared/
    └── .do/
```

## Phase 1: Foundation Setup (Days 1-3)

### Step 1.1: Initialize Project Structure
**Files to create:**
- `Aim Assist SaaS/package.json` (root orchestrator)
- `Aim Assist SaaS/backend/package.json`
- `Aim Assist SaaS/frontend/package.json`
- `Aim Assist SaaS/README.md`
- `Aim Assist SaaS/.gitignore`

**WHEN:** Running `cd "Aim Assist SaaS" && npm install`
**THEN:** Both frontend and backend directories should have node_modules installed

**Testing:** 
```bash
# Verify structure exists
ls -la backend/node_modules
ls -la frontend/node_modules
# Should show populated directories
```

### Step 1.2: Database Schema Setup
**Files to create with detailed comments:**
- `Aim Assist SaaS/backend/migrations/001_create_tenants.sql`
```sql
-- This table stores each company using Aim Assist
-- Each tenant is completely isolated from others
-- Includes subscription and settings for the company
```

- `Aim Assist SaaS/backend/migrations/002_create_users.sql`
```sql
-- Users belong to tenants (companies)
-- Linked to Supabase Auth for authentication
-- Roles determine what users can do in the system
```

- `Aim Assist SaaS/backend/migrations/003_create_crm_integrations.sql`
```sql
-- Stores CRM credentials and configuration per tenant
-- Supports multiple CRM types (FUB, Lofty, etc.)
-- Credentials stored encrypted in Supabase Vault
```

**WHEN:** Running migrations against Supabase
**THEN:** 
1. All tables should exist in Supabase dashboard
2. RLS policies should be enabled
3. Foreign key relationships should be valid

**Testing:**
```sql
-- Connect to Supabase and verify
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Should list: tenants, users, crm_integrations, leads, conversations, messages, templates
```

### Step 1.3: Backend Core Setup
**Files to create:**
- `Aim Assist SaaS/backend/src/index.js`
```javascript
/**
 * Main entry point for Aim Assist API
 * Initializes Express server, Supabase, Redis queues
 * Sets up all routes and starts queue processors
 */
```

- `Aim Assist SaaS/backend/src/config/supabase.js`
```javascript
/**
 * Supabase client configuration
 * Uses service key for backend operations
 * Exports authenticated client for database operations
 */
```

**WHEN:** Running `cd backend && npm start`
**THEN:** 
1. Server starts on port 3001
2. Console shows "🎯 Aim Assist API running on port 3001"
3. Health check endpoint responds at http://localhost:3001/health

**Testing:**
```bash
curl http://localhost:3001/health
# Should return: {"status":"healthy","service":"aim-assist-api"}
```

## Phase 2: Authentication & Multi-Tenancy (Days 4-6)

### Step 2.1: Authentication Middleware
**Files to create:**
- `Aim Assist SaaS/backend/src/middleware/authenticate.js`
```javascript
/**
 * Verifies Supabase JWT tokens
 * Extracts user ID and tenant ID from token
 * Attaches user object to request for downstream use
 */
```

**WHEN:** Making API call with valid Supabase token
**THEN:** Request proceeds to route handler with req.user populated

**WHEN:** Making API call without token or invalid token  
**THEN:** Returns 401 Unauthorized

**Testing:**
```bash
# Without token
curl http://localhost:3001/api/protected
# Should return 401

# With valid token (get from Supabase dashboard)
curl -H "Authorization: Bearer [token]" http://localhost:3001/api/protected
# Should return success
```

### Step 2.2: Tenant Service
**Files to create:**
- `Aim Assist SaaS/backend/src/services/TenantService.js`
```javascript
/**
 * Manages tenant (company) operations
 * - Create new tenant on signup
 * - Get tenant by ID or subdomain
 * - Update tenant settings
 * - Check subscription status
 */
```

**WHEN:** Creating a new tenant via TenantService.create()
**THEN:** 
1. Tenant record created in database
2. Stripe customer created
3. Trial period set to 14 days from now
4. Default settings populated

**Testing:**
```javascript
// Test script: backend/test-tenant-creation.js
const tenant = await TenantService.create({
  name: 'Test Company',
  subdomain: 'test-company',
  industry: 'real_estate'
});
console.log(tenant);
// Should show tenant with ID, stripe_customer_id, and trial_ends_at
```

### Step 2.3: Frontend Authentication
**Files to create:**
- `Aim Assist SaaS/frontend/src/contexts/SupabaseContext.js`
```javascript
/**
 * Provides Supabase client to entire app
 * Manages authentication state
 * Handles login/logout/signup operations
 * Includes Google OAuth support
 */
```

- `Aim Assist SaaS/frontend/src/components/auth/LoginForm.js`
```javascript
/**
 * Login UI with email/password and Google OAuth
 * Shows loading states and error messages
 * Redirects to dashboard on success
 */
```

**WHEN:** User enters valid credentials and clicks login
**THEN:** 
1. Loading spinner appears
2. Supabase authenticates user
3. Redirects to /dashboard
4. User session persists in localStorage

**WHEN:** User clicks "Sign in with Google"
**THEN:**
1. Redirects to Google OAuth
2. Returns to app authenticated
3. Creates user record if first time

**Testing:**
```bash
# Start frontend
cd frontend && npm start
# Navigate to http://localhost:3000
# Should see login form
# Test both email and Google login
```

## Phase 3: CRM Integration Layer (Days 7-10)

### Step 3.1: CRM Adapter Base Class
**Files to create:**
- `Aim Assist SaaS/backend/src/services/crm/CRMAdapter.js`
```javascript
/**
 * Abstract base class for all CRM integrations
 * Defines standard interface that all CRMs must implement
 * Includes utility methods for phone normalization, field mapping
 */
```

**WHEN:** Any CRM adapter extends CRMAdapter
**THEN:** Must implement all required methods or throw error

**Testing:**
```javascript
// Should throw error if methods not implemented
class TestAdapter extends CRMAdapter {}
const adapter = new TestAdapter();
adapter.getLeads(); // Should throw "getLeads must be implemented"
```

### Step 3.2: Follow Up Boss Adapter
**Files to create:**
- `Aim Assist SaaS/backend/src/services/crm/adapters/FollowUpBossAdapter.js`
```javascript
/**
 * FUB implementation of CRM adapter
 * Handles API authentication with Basic Auth
 * Maps FUB fields to Aim Assist standard schema
 * Manages lead CRUD and conversation logging
 */
```

**WHEN:** Creating FUB adapter with valid credentials
**THEN:** Can successfully fetch leads from FUB API

**WHEN:** Calling getLead() with valid FUB lead ID
**THEN:** Returns lead data mapped to standard schema with:
- first_name, last_name, email, phone (normalized)
- source, tags array
- Original FUB data in crm_data field

**Testing:**
```javascript
// Test script: backend/test-fub-adapter.js
const adapter = new FollowUpBossAdapter(tenantId, {
  credentials: {
    api_key: process.env.TEST_FUB_API_KEY,
    x_system: process.env.TEST_FUB_X_SYSTEM,
    x_system_key: process.env.TEST_FUB_X_SYSTEM_KEY
  }
});

const leads = await adapter.getLeads({ limit: 5 });
console.log('FUB Leads:', leads);
// Should show 5 leads with standard schema
```

### Step 3.3: Lofty Adapter (Placeholder)
**Files to create:**
- `Aim Assist SaaS/backend/src/services/crm/adapters/LoftyAdapter.js`
```javascript
/**
 * Lofty (formerly Chime) CRM implementation
 * Placeholder for second CRM to test multi-CRM support
 * Will be implemented after FUB is working
 */
```

### Step 3.4: CRM Factory Pattern
**Files to create:**
- `Aim Assist SaaS/backend/src/services/crm/CRMFactory.js`
```javascript
/**
 * Factory pattern to instantiate correct CRM adapter
 * Loads tenant's CRM configuration from database
 * Decrypts credentials from Supabase Vault
 * Returns configured adapter instance
 */
```

**WHEN:** Calling CRMFactory.getAdapter(tenantId) for tenant with FUB
**THEN:** Returns instance of FollowUpBossAdapter with credentials loaded

**WHEN:** Calling CRMFactory.getAdapter(tenantId) for tenant with Lofty
**THEN:** Returns instance of LoftyAdapter with credentials loaded

**Testing:**
```javascript
// Create test tenant with FUB integration
const tenant1 = await createTestTenant('fub');
const adapter1 = await CRMFactory.getAdapter(tenant1.id);
console.log(adapter1.constructor.name); // Should be "FollowUpBossAdapter"

// Create test tenant with Lofty integration  
const tenant2 = await createTestTenant('lofty');
const adapter2 = await CRMFactory.getAdapter(tenant2.id);
console.log(adapter2.constructor.name); // Should be "LoftyAdapter"
```

## Phase 4: Lead Management & Messaging (Days 11-14)

### Step 4.1: Lead Service
**Files to create:**
- `Aim Assist SaaS/backend/src/services/LeadService.js`
```javascript
/**
 * Manages lead operations across all CRMs
 * Caches lead data in local database for performance
 * Syncs with CRM periodically
 * Tracks AI engagement status per lead
 */
```

**WHEN:** Calling LeadService.syncFromCRM(tenantId)
**THEN:**
1. Fetches all leads from tenant's CRM
2. Upserts into local database with tenant_id
3. Returns count of new/updated leads

**WHEN:** Calling LeadService.getByPhone(tenantId, phoneNumber)
**THEN:**
1. Normalizes phone to E.164 format
2. Searches local cache first
3. Falls back to CRM API if not found
4. Returns lead or null

**Testing:**
```javascript
// Sync leads from CRM
const syncResult = await LeadService.syncFromCRM(testTenantId);
console.log(`Synced ${syncResult.created} new, ${syncResult.updated} updated leads`);

// Find lead by phone
const lead = await LeadService.getByPhone(testTenantId, '(706) 818-4445');
console.log(lead); // Should show Test Everitt
```

### Step 4.2: Twilio Service with Subaccounts
**Files to create:**
- `Aim Assist SaaS/backend/src/services/messaging/TwilioService.js`
```javascript
/**
 * Enhanced Twilio integration with subaccounts per tenant
 * Each tenant gets isolated SMS capability
 * Manages phone number pool per tenant
 * Handles SMS sending with rate limiting
 */
```

**WHEN:** Tenant purchases phone number
**THEN:**
1. Creates Twilio subaccount for tenant
2. Purchases number under subaccount
3. Stores number in phone_numbers table
4. Configures webhook URL for incoming SMS

**WHEN:** Sending SMS via TwilioService.send()
**THEN:**
1. Uses tenant's primary phone number as sender
2. Sends via tenant's Twilio subaccount
3. Returns message SID
4. Logs to conversation history

**Testing:**
```bash
# Test SMS sending
curl -X POST http://localhost:3001/api/test-sms \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"to": "+17068184445", "message": "Test from Aim Assist"}'
# Should return: {"success": true, "sid": "SM..."}
```

### Step 4.3: Message Queue System
**Files to create:**
- `Aim Assist SaaS/backend/src/queues/QueueManager.js`
```javascript
/**
 * Initializes Bull queues with Redis
 * Creates separate queues for SMS, auto-text, CRM sync
 * Configures retry logic and rate limiting
 * Provides queue monitoring endpoints
 */
```

- `Aim Assist SaaS/backend/src/queues/processors/smsProcessor.js`
```javascript
/**
 * Processes SMS jobs from queue
 * Implements 45-second delay for natural timing
 * Handles retries on failure
 * Updates conversation after sending
 */
```

**WHEN:** Job added to SMS queue
**THEN:**
1. Job appears in Redis queue
2. Processor picks up job after delay
3. SMS sent via Twilio
4. Job marked complete or failed

**Testing:**
```javascript
// Add test job to queue
const job = await smsQueue.add({
  tenantId: testTenantId,
  to: '+17068184445',
  message: 'Queue test message',
  delay: 5000 // 5 seconds
});

// Monitor job
job.on('completed', result => console.log('SMS sent:', result));
job.on('failed', err => console.error('SMS failed:', err));
```

## Phase 5: AI Integration (Days 15-17)

### Step 5.1: AI Service with Multiple Providers
**Files to create:**
- `Aim Assist SaaS/backend/src/services/ai/AIService.js`
```javascript
/**
 * Orchestrates AI providers (Claude, Gemini, GPT-4)
 * Selects provider based on tenant settings
 * Handles prompt building with variable substitution
 * Enforces SMS length limits (160 chars)
 */
```

**WHEN:** Calling AIService.generateReply() with Claude selected
**THEN:**
1. Builds prompt with conversation context
2. Calls Claude API with temperature settings
3. Returns response under 160 characters
4. Response is contextually appropriate

**WHEN:** Tenant switches from Claude to Gemini
**THEN:**
1. Next AI call uses Gemini API
2. Same prompt format works
3. Similar quality responses

**Testing:**
```javascript
// Test with Claude
const claudeService = new AIService({ ai_provider: 'claude', ai_temperature: 0.7 });
const claudeReply = await claudeService.generateReply({
  prompt: testPrompt,
  context: testContext
});
console.log('Claude:', claudeReply);
// Should be under 160 chars

// Test with Gemini
const geminiService = new AIService({ ai_provider: 'gemini', ai_temperature: 0.7 });
const geminiReply = await geminiService.generateReply({
  prompt: testPrompt,
  context: testContext
});
console.log('Gemini:', geminiReply);
// Should be under 160 chars
```

### Step 5.2: Prompt Management
**Files to create:**
- `Aim Assist SaaS/backend/src/services/ai/PromptEngine.js`
```javascript
/**
 * Manages prompt templates per tenant
 * Handles variable substitution (name, agency, etc.)
 * Loads industry-specific defaults
 * Allows tenant customization
 */
```

**WHEN:** Tenant saves custom prompt
**THEN:**
1. Prompt saved to database with tenant_id
2. Next AI generation uses custom prompt
3. Variables properly substituted

**Testing:**
```javascript
// Save custom prompt
await PromptEngine.savePrompt(tenantId, 'conversation_reply', 
  'Hi ${leadName}, this is ${agencyName}. ${currentMessage}');

// Generate with custom prompt
const prompt = await PromptEngine.getPrompt(tenantId, 'conversation_reply');
const final = PromptEngine.substituteVariables(prompt, {
  leadName: 'Bob',
  agencyName: 'Test Realty',
  currentMessage: 'Are you still looking?'
});
console.log(final);
// Should output: "Hi Bob, this is Test Realty. Are you still looking?"
```

## Phase 6: Auto-Text System (Days 18-20)

### Step 6.1: Auto-Text Service
**Files to create:**
- `Aim Assist SaaS/backend/src/services/automation/AutoTextService.js`
```javascript
/**
 * Monitors for new leads from configured sources
 * Checks business hours and timezone settings
 * Queues automatic text messages with delays
 * Tracks which leads have been auto-texted
 */
```

**WHEN:** New lead created with source "website" AND auto-text enabled for "website"
**THEN:**
1. Lead detected within 1 minute
2. Auto-text job queued with configured delay
3. SMS sent after delay
4. Lead marked as auto_texted = true

**WHEN:** New lead created outside business hours AND business hours enabled
**THEN:**
1. Lead detected but NOT queued
2. Will be queued when business hours start

**Testing:**
```javascript
// Enable auto-text for tenant
await TenantService.updateSettings(tenantId, {
  auto_text_enabled: true,
  auto_text_sources: ['website'],
  auto_text_delay_minutes: 1
});

// Create test lead
const lead = await CRMAdapter.createLead({
  firstName: 'Auto',
  lastName: 'Test',
  phone: '+17068184445',
  source: 'website'
});

// Wait for auto-text
setTimeout(async () => {
  const messages = await ConversationService.getMessages(lead.id);
  console.log('Auto-text sent:', messages[0]);
  // Should show automated message sent after 1 minute
}, 65000);
```

### Step 6.2: Lead Detection Service
**Files to create:**
- `Aim Assist SaaS/backend/src/services/automation/LeadDetectionService.js`
```javascript
/**
 * Polls CRM for new leads at configured intervals
 * Processes webhook events for instant detection
 * Filters by source and eligibility criteria
 * Triggers auto-text workflow for qualified leads
 */
```

**WHEN:** CRM webhook fires with new lead event
**THEN:**
1. Webhook validated and parsed
2. Lead checked against auto-text criteria
3. If eligible, auto-text queued
4. Webhook returns 200 OK

**Testing:**
```bash
# Simulate FUB webhook
curl -X POST http://localhost:3001/webhook/fub \
  -H "Content-Type: application/json" \
  -H "X-FUB-Signature: [signature]" \
  -d '{
    "event": "person.created",
    "data": {
      "id": "123",
      "firstName": "Webhook",
      "lastName": "Test",
      "phones": [{"value": "7068184445"}],
      "source": "website"
    }
  }'
# Should return 200 and trigger auto-text
```

## Phase 7: Frontend UI Implementation (Days 21-25)

### Step 7.1: Dashboard Layout
**Files to create:**
- `Aim Assist SaaS/frontend/src/layouts/DashboardLayout.js`
```javascript
/**
 * Main layout wrapper for authenticated pages
 * Includes sidebar navigation, top bar with user menu
 * Responsive design with mobile menu
 * Theme switcher (light/dark/beach modes from current)
 */
```

**WHEN:** User navigates to any authenticated page
**THEN:**
1. Dashboard layout wraps content
2. Sidebar shows navigation items
3. Top bar shows user name and tenant name
4. Logout button visible

**Testing:**
```bash
# Visual testing
# Navigate to http://localhost:3000/dashboard
# Should see sidebar on left, main content area
# Click menu items - should navigate correctly
# Click logout - should return to login
```

### Step 7.2: Lead Management UI
**Files to create:**
- `Aim Assist SaaS/frontend/src/pages/Leads.js`
```javascript
/**
 * Main leads page showing list and search
 * Adapts current LeadManagementView component
 * Shows only current tenant's leads
 * Real-time updates via Supabase subscriptions
 */
```

- `Aim Assist SaaS/frontend/src/components/leads/LeadList.js`
```javascript
/**
 * Displays paginated list of leads
 * Shows AI status indicators
 * Click to view conversation
 * Bulk actions support
 */
```

**WHEN:** Page loads
**THEN:**
1. Shows loading spinner
2. Fetches tenant's leads from API
3. Displays leads in list/card format
4. Search bar filters in real-time

**WHEN:** New lead created in CRM
**THEN:**
1. Lead appears in list within 5 seconds (via realtime)
2. Shows "NEW" badge
3. Auto-text indicator if applicable

**Testing:**
```javascript
// Add test lead via API while UI is open
const newLead = await fetch('/api/leads', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ firstName: 'UI', lastName: 'Test' })
});
// Should appear in UI automatically
```

### Step 7.3: Conversation View
**Files to create:**
- `Aim Assist SaaS/frontend/src/components/conversations/ConversationView.js`
```javascript
/**
 * WhatsApp-style conversation interface (copy from current)
 * Shows message history with timestamps
 * AI and human messages clearly distinguished
 * Message input with AI suggestion button
 */
```

**WHEN:** User clicks on lead
**THEN:**
1. Conversation panel opens
2. Message history loads
3. Scrolls to bottom automatically
4. Input field ready for typing

**WHEN:** User types message and clicks "Get AI Reply"
**THEN:**
1. Loading indicator appears
2. AI generates contextual response
3. Response appears with "Send" button
4. User can edit before sending

**Testing:**
```bash
# Open conversation for Test Everitt (lead 470)
# Type: "Are you still looking for a home?"
# Click "Get AI Reply"
# Should see relevant response under 160 chars
# Click "Send" - message should appear in conversation
```

### Step 7.4: Settings Pages
**Files to create:**
- `Aim Assist SaaS/frontend/src/pages/Settings.js`
```javascript
/**
 * Settings hub with tabs for different sections
 * General, CRM, Phone Numbers, AI, Team, Billing
 * Saves changes immediately with optimistic updates
 * Shows success/error notifications
 */
```

- `Aim Assist SaaS/frontend/src/components/settings/CRMIntegration.js`
```javascript
/**
 * CRM connection interface
 * Dropdown to select CRM type (FUB, Lofty)
 * Input fields for API credentials
 * Test connection button
 * Field mapping configuration
 */
```

**WHEN:** User selects "Follow Up Boss" and enters credentials
**THEN:**
1. Shows FUB-specific fields (API Key, X-System, X-System-Key)
2. Test Connection button becomes active
3. Clicking test shows success/failure
4. On success, Save button enabled

**Testing:**
```bash
# Navigate to Settings > CRM Integration
# Select Follow Up Boss
# Enter test credentials
# Click "Test Connection"
# Should show "✓ Connected successfully"
# Click Save
# Should show "Settings saved"
```

### Step 7.5: Automation Settings
**Files to create:**
- `Aim Assist SaaS/frontend/src/pages/Automation.js`
```javascript
/**
 * Auto-text configuration interface
 * Main toggle to enable/disable
 * Source checkboxes (website, zillow, etc.)
 * Delay slider (0-60 minutes)
 * Business hours configuration
 */
```

**WHEN:** User enables auto-text and selects sources
**THEN:**
1. Settings save to database
2. Backend starts monitoring for new leads
3. Test button appears to simulate

**Testing:**
```bash
# Enable auto-text for "website" source
# Set delay to 2 minutes
# Click "Test Auto-Text"
# Should show preview of message that would be sent
# Create test lead with "website" source
# Check that auto-text triggers after 2 minutes
```

## Phase 8: Billing Integration (Days 26-28)

### Step 8.1: Stripe Service
**Files to create:**
- `Aim Assist SaaS/backend/src/services/billing/StripeService.js`
```javascript
/**
 * Stripe integration for subscriptions
 * Creates customers on tenant signup
 * Manages subscription lifecycle
 * Handles payment methods and invoices
 * Webhook processing for events
 */
```

**WHEN:** New tenant signs up
**THEN:**
1. Stripe customer created with tenant ID in metadata
2. 14-day trial starts
3. No payment method required initially

**WHEN:** Tenant upgrades from trial to paid plan
**THEN:**
1. Stripe checkout session created
2. User redirected to Stripe checkout
3. On success, subscription activated
4. Webhook updates tenant status

**Testing:**
```javascript
// Create checkout session
const session = await StripeService.createCheckoutSession({
  tenantId: testTenantId,
  plan: 'growth',
  successUrl: 'http://localhost:3000/billing/success',
  cancelUrl: 'http://localhost:3000/billing'
});
console.log('Checkout URL:', session.url);
// Should return Stripe checkout URL

// Simulate webhook
const event = {
  type: 'checkout.session.completed',
  data: { object: { client_reference_id: testTenantId } }
};
await StripeService.handleWebhook(event);
// Should update tenant subscription status
```

### Step 8.2: Usage Tracking
**Files to create:**
- `Aim Assist SaaS/backend/src/services/billing/UsageTracker.js`
```javascript
/**
 * Tracks usage metrics for billing
 * Counts leads, SMS, API calls per tenant
 * Enforces plan limits
 * Generates usage reports
 */
```

**WHEN:** SMS sent by tenant
**THEN:**
1. Usage metric recorded with tenant_id
2. Monthly SMS count incremented
3. If over limit, queued for next period or blocked

**Testing:**
```javascript
// Track SMS usage
await UsageTracker.record(tenantId, 'sms_sent', 1);

// Check usage
const usage = await UsageTracker.getMonthly(tenantId);
console.log('SMS this month:', usage.sms_sent);
// Should show accurate count

// Check limit
const canSend = await UsageTracker.checkLimit(tenantId, 'sms_sent');
console.log('Can send SMS:', canSend);
// Should be true if under plan limit
```

## Phase 9: Production Deployment (Days 29-30)

### Step 9.1: Digital Ocean Configuration
**Files to create:**
- `Aim Assist SaaS/.do/app.yaml`
```yaml
# Digital Ocean App Platform configuration
# Defines services, databases, environment variables
# Configures auto-deploy from GitHub
```

**WHEN:** Pushing to main branch
**THEN:**
1. Digital Ocean detects change
2. Builds both frontend and backend
3. Deploys to production
4. Runs database migrations
5. New version live in ~5 minutes

**Testing:**
```bash
# After deployment
curl https://api.aim-assist.com/health
# Should return: {"status":"healthy"}

# Check frontend
curl https://app.aim-assist.com
# Should return React app HTML
```

### Step 9.2: Monitoring Setup
**Files to create:**
- `Aim Assist SaaS/backend/src/instrument.js`
```javascript
/**
 * Sentry initialization for error tracking
 * Captures all unhandled errors
 * Includes user and tenant context
 * Performance monitoring enabled
 */
```

**WHEN:** Error occurs in production
**THEN:**
1. Error captured by Sentry
2. Alert sent to team
3. Full stack trace available
4. User/tenant context included

**Testing:**
```bash
# Trigger test error
curl https://api.aim-assist.com/debug-sentry
# Check Sentry dashboard - should show test error
```

## Complete Testing Checklist

### Multi-Tenant Isolation Test
```javascript
// Create two test tenants
const tenant1 = await TenantService.create({
  name: 'Company A',
  subdomain: 'company-a'
});

const tenant2 = await TenantService.create({
  name: 'Company B',
  subdomain: 'company-b'
});

// Create leads for each
const lead1 = await LeadService.create(tenant1.id, { name: 'Lead A' });
const lead2 = await LeadService.create(tenant2.id, { name: 'Lead B' });

// Verify isolation
const tenant1Leads = await LeadService.getAll(tenant1.id);
console.log(tenant1Leads); // Should ONLY show Lead A

const tenant2Leads = await LeadService.getAll(tenant2.id);
console.log(tenant2Leads); // Should ONLY show Lead B
```

### CRM Integration Test (FUB + Lofty)
```javascript
// Test FUB connection
const fubTenant = await createTenantWithFUB();
const fubAdapter = await CRMFactory.getAdapter(fubTenant.id);
const fubLeads = await fubAdapter.getLeads();
console.log('FUB leads:', fubLeads.length);

// Test Lofty connection (when implemented)
const loftyTenant = await createTenantWithLofty();
const loftyAdapter = await CRMFactory.getAdapter(loftyTenant.id);
const loftyLeads = await loftyAdapter.getLeads();
console.log('Lofty leads:', loftyLeads.length);
```

### End-to-End Auto-Text Test
```javascript
// Setup tenant with auto-text
const tenant = await TenantService.create({
  name: 'Auto Test Inc',
  settings: {
    auto_text_enabled: true,
    auto_text_sources: ['website'],
    auto_text_delay_minutes: 1
  }
});

// Create lead via CRM
const lead = await crmAdapter.createLead({
  firstName: 'John',
  phone: '+17068184445',
  source: 'website'
});

// Wait and verify
setTimeout(async () => {
  const messages = await ConversationService.getMessages(lead.id);
  assert(messages.length > 0, 'Auto-text should have been sent');
  assert(messages[0].direction === 'outbound', 'Should be outbound');
  assert(messages[0].sender_type === 'ai', 'Should be from AI');
  console.log('✅ Auto-text test passed');
}, 70000);
```

## Pre-Approved Commands
These commands can be run without asking:

```bash
# Directory navigation
cd "Aim Assist SaaS"/*
ls -la
pwd

# Package management
npm install [any-package]
npm run [any-script]
npm list

# Git operations
git status
git diff
git log --oneline -20
git branch

# Testing
npm test
curl http://localhost:3001/*
curl http://localhost:3000/*

# Database queries (read-only)
psql -c "SELECT * FROM tenants"
psql -c "SELECT COUNT(*) FROM leads WHERE tenant_id = '[id]'"

# File operations within Aim Assist SaaS/
mkdir -p *
touch *
cp ../eugenia-frontend/src/* frontend/src/*
cp ../eugenia-backend/* backend/*

# Process management
lsof -i :3000
lsof -i :3001
pkill -f "node.*aim-assist"

# Environment setup
cp .env.example .env
echo "VAR=value" >> .env

# Docker/deployment
docker build
docker-compose up
doctl apps list
```

## Success Criteria Summary

The platform is considered MVP-ready when:

1. ✅ Two separate companies can sign up and use the platform simultaneously
2. ✅ Each company's data is completely isolated
3. ✅ Both FUB and Lofty CRM integrations work
4. ✅ Auto-text sends to new leads within configured time
5. ✅ AI responses are contextual and under 160 characters
6. ✅ Billing creates Stripe subscriptions and enforces limits
7. ✅ Frontend works on desktop and mobile
8. ✅ System handles 100+ concurrent users
9. ✅ All errors are caught and logged to Sentry
10. ✅ Deployment to Digital Ocean works with single command

Each file should have comprehensive comments explaining its purpose and how it fits into the larger system.