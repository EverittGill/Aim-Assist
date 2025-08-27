# CRITICAL FILES AUDIT - Aim Assist SaaS Platform

This document identifies the critical directories and files for understanding the data flow between CRMs, the multi-tenant system, Supabase data tables, and translation systems.

## Critical Directories for Data Flow Understanding

### 1. `/backend/src/services/crm/` - CRM Integration Layer
- **`CRMFactory.js`** - Factory pattern for multi-CRM support
- **`adapters/FollowUpBossAdapter.js`** - FUB API integration with field mapping
- **`adapters/LoftyAdapter.js`** - Lofty CRM adapter (placeholder)
- **Purpose**: Contains the translation between CRM-specific fields and standardized schema

### 2. `/backend/src/services/` - Core Business Logic
- **`TagPollingService.js`** - Polls CRMs for tagged leads, creates/updates in Supabase
- **`CRMSyncService.js`** - Bi-directional sync between CRMs and Supabase  
- **`ConversationService.js`** - Manages message history and conversation flow
- **`ConversationSyncService.js`** - Syncs conversations between systems
- **`TenantService.js`** - Multi-tenant isolation and context management
- **`database/TenantService.js`** - Database-level tenant operations
- **`ExtractionService.js`** - Extracts structured data from conversations
- **`QualificationService.js`** - Lead qualification tracking

### 3. `/backend/src/queues/` - Async Processing & Message Flow
- **`QueueManager.js`** - Central queue orchestration
- **`processors/smsProcessor.js`** - SMS sending via Twilio
- **`processors/tagPollProcessor.js`** - Processes tag polling jobs  
- **`processors/leadSyncProcessor.js`** - Lead synchronization
- **`processors/webhookProcessor.js`** - Incoming webhook processing
- **`processors/extractionProcessor.js`** - Data extraction processing

### 4. `/backend/src/routes/webhooks/` - Incoming Data Entry Points
- **`twilio.js`** - Receives SMS from leads, triggers AI responses
- **Purpose**: Handles incoming messages and routes them through the system

### 5. `/backend/migrations/` - Database Schema Evolution  
- Shows the evolution from `organizations` to `tenants` terminology
- **Critical migrations**:
  - `012_tag_polling_configs.sql` - Tag polling configuration
  - `013_rename_organizations_to_tenants.sql` - Terminology transition (NOT YET RUN)
  - `add-phone-columns.sql` - Phone number storage changes
  - `011_complete_infrastructure.sql` - Core tables setup

## Key Translation/Mapping Points

### Field Name Translations

#### 1. Database → Code
- `organization_id` (DB) → `tenantId` (Code)
- `fub_lead_id` (DB) → `crm_lead_id` (Code)
- `organization_id` (DB) → `organizationId` (intermediate) → `tenantId` (final)

#### 2. CRM → Standard Schema (in FollowUpBossAdapter)
- FUB `firstName/lastName` → `first_name/last_name`
- FUB `phones` array → `phone` (primary) + `phone_secondary`  
- FUB `emails` array → `email` (primary)
- FUB `customFields` → stored in `custom_data`
- FUB `tags` → `tags` array
- FUB `id` → `crm_lead_id` or `fub_lead_id`

#### 3. Queue Job Parameters
- `organizationId` → `tenantId` (for SMS processor)
- `phone` → `to` (for SMS processor)
- Lead object `organization_id` → job `tenantId`

## Data Flow Patterns

### Inbound Lead Flow (CRM → System)
```
FUB API (external)
    ↓
TagPollingService.pollForTag() [every 5 minutes]
    ↓
FollowUpBossAdapter.getLeadsByTag()
    ↓
FollowUpBossAdapter.mapFUBToStandard() [field translation]
    ↓
TagPollingService.createLead() or updateLead()
    ↓
Supabase leads table (with organization_id)
    ↓
Queue System (QueueManager.queueSMS)
    ↓
SMS/AI Processing
```

### Outbound Message Flow (System → Lead)
```
AI Response Generation (ClaudeService)
    ↓
QueueManager.queueSMS() [field translation: tenantId, to]
    ↓
smsProcessor.processSMS()
    ↓
TwilioService.sendSMS()
    ↓
SMS Delivery to Lead
    ↓
FollowUpBossAdapter.logMessage() [log to FUB]
```

### Synchronization Flow (Bi-directional)
```
CRMSyncService.incrementalSync() [runs periodically]
    ↓
CRMFactory.getAdapter(tenantId)
    ↓
Adapter.getLeads() or getConversations()
    ↓
mapFUBToStandard() [field translation]
    ↓
Upsert to Supabase (leads/conversations tables)
    ↓
Track in sync_history (if table exists)
```

### Webhook Message Flow (Incoming SMS)
```
Twilio SMS Webhook
    ↓
/routes/webhooks/twilio.js
    ↓
Lead lookup by phone number
    ↓
ConversationService.storeMessage()
    ↓
AI Response Generation
    ↓
QueueManager.queueSMS()
    ↓
Back to Outbound Flow
```

## Current Architecture Issues to Audit

### 1. Mixed Terminology Issue
- **Problem**: Code uses `tenant/tenantId` but database still has `organization_id`
- **Impact**: Field translation required at multiple points
- **Files affected**: All services that interact with database
- **Migration pending**: `013_rename_organizations_to_tenants.sql`

### 2. Missing Database Tables
- `tenants` table (code expects it, but it's `organizations`)
- `sync_history` table (referenced but doesn't exist)
- `usage_metrics` table (referenced but doesn't exist)
- `auto_text_rules` table (checked but doesn't exist)

### 3. Field Mapping Inconsistencies
- Some services expect `tenantId`, others use `organizationId`
- SMS processor expects `to` but some code passes `phone`
- Lead ID referenced as both `leadId` and `lead_id`

### 4. Phone Number Handling Transition
- Old: Stored in `custom_data.all_phones` array
- New: Dedicated `phone` and `phone_secondary` columns
- Mixed usage throughout codebase

### 5. Tag Tracking Complexity
- Stored in `custom_data.tag_tracking` as nested JSON
- Complex structure: `tag_tracking.AIM_ASSIST.{detected, text_sent, processed}`
- No database constraints or validation

### 6. CRM Type Resolution
- `organizations.crm_type` column doesn't exist
- Fallback to environment variables for FUB configuration
- Multi-CRM support incomplete

## Recommended Audit Order

### Phase 1: Core Data Flow
1. **`CRMFactory.js`** - How CRM adapters are selected
2. **`adapters/FollowUpBossAdapter.js`** - Primary CRM integration
3. **`TagPollingService.js`** - Main entry point for lead creation
4. **`CRMSyncService.js`** - Synchronization logic

### Phase 2: Message Processing
1. **`QueueManager.js`** - Central queue orchestration
2. **`processors/smsProcessor.js`** - SMS sending logic
3. **`routes/webhooks/twilio.js`** - Incoming message handling
4. **`ConversationService.js`** - Message storage and retrieval

### Phase 3: Database Schema
1. **All files in `/migrations/`** - Pending schema changes
2. Compare expected tables vs actual Supabase tables
3. Check field name consistency across services

### Phase 4: Multi-tenant Isolation
1. **`TenantService.js`** - Tenant context management
2. **`config/supabase.js`** - RLS and tenant context
3. Verify tenant isolation in all queries

## Critical Integration Points

### 1. Lead Creation/Update
- Entry: `TagPollingService.processLead()`
- Translation: `FollowUpBossAdapter.mapFUBToStandard()`
- Storage: `leads` table with `organization_id`

### 2. SMS Sending
- Entry: `QueueManager.queueSMS()`
- Translation: `organizationId` → `tenantId`, `phone` → `to`
- Processing: `smsProcessor.processSMS()`

### 3. Conversation Tracking
- Entry: Twilio webhook or FUB API
- Storage: `ConversationService.storeMessage()`
- Sync: `ConversationSyncService.syncConversations()`

## Known Working Patterns

### Successful SMS Queue Pattern
```javascript
await QueueManager.queueSMS({
  tenantId: lead.organization_id,  // Note the translation
  leadId: lead.id,
  to: lead.phone,                   // Note: 'to' not 'phone'
  message: messageText,
  conversationId: null,
  delay: milliseconds
});
```

### Successful Lead Lookup Pattern
```javascript
const { data: lead } = await supabase
  .from('leads')
  .select('*')
  .eq('organization_id', tenantId)  // Note: not tenant_id
  .eq('fub_lead_id', crmLeadId)
  .single();
```

## Testing Checklist

- [ ] Create lead with AIM_ASSIST tag in FUB
- [ ] Verify lead appears in Supabase with correct fields
- [ ] Verify auto-text SMS is sent
- [ ] Send reply from lead's phone
- [ ] Verify reply is received and processed
- [ ] Verify AI response is generated and sent
- [ ] Verify all messages appear in FUB conversation
- [ ] Verify tenant isolation (no cross-tenant data leakage)

## Notes for Auditor

1. **The system works** but has architectural debt from the organization→tenant transition
2. **Field translations are critical** - missing translations cause failures
3. **Database schema doesn't match code expectations** in several places
4. **Multi-tenant support is partial** - mostly hardcoded to one tenant ID
5. **Error handling often continues** despite failures (defensive programming)

Last Updated: 2025-08-27
Generated for audit of multi-tenant CRM integration system following auto-text SMS fix.