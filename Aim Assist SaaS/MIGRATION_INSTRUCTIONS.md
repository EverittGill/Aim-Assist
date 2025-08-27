# Database Migration Instructions

## Quick Start
1. Go to: https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql/new
2. Copy the contents of `ALL_MIGRATIONS_COMBINED.sql`
3. Paste in SQL editor and click "Run"
4. Then run: `node test-all-migrations.js` to verify

## Individual Migration Files

### Migration 001: Extensions and ENUMs
- **File**: `supabase/migrations/001_extensions_and_enums.sql`
- **Purpose**: Enable PostgreSQL extensions and create ENUM types
- **Test**: Run `node test-migration-001.js` after executing

### Migration 002: Organizations
- **File**: `supabase/migrations/002_organizations.sql`
- **Purpose**: Create organizations table with single AI phone per tenant
- **Test**: Run `node test-migration-002.js` after executing

### Migration 003: Agents
- **File**: `supabase/migrations/003_agents.sql`
- **Purpose**: Create agents table with notification phones
- **Test**: Run `node test-migration-003.js` after executing

### Migration 004: CRM Integration
- **File**: `supabase/migrations/004_crm_integration.sql`
- **Purpose**: CRM adapters and field mapping
- **Test**: Run `node test-migration-004.js` after executing

### Migration 005: Leads
- **File**: `supabase/migrations/005_leads.sql`
- **Purpose**: Flexible lead storage with JSONB
- **Test**: Run `node test-migration-005.js` after executing

### Migration 006: Conversations
- **File**: `supabase/migrations/006_conversations.sql`
- **Purpose**: Conversation tracking
- **Test**: Run `node test-migration-006.js` after executing

### Migration 007: Messages (Partitioned)
- **File**: `supabase/migrations/007_messages_partitioned.sql`
- **Purpose**: Partitioned messages for scale
- **Test**: Run `node test-migration-007.js` after executing

### Migration 008: AI & Qualification
- **File**: `supabase/migrations/008_ai_qualification.sql`
- **Purpose**: AI context and qualification tracking
- **Test**: Run `node test-migration-008.js` after executing

### Migration 009: Indexes & RLS
- **File**: `supabase/migrations/009_indexes_rls.sql`
- **Purpose**: Performance indexes and security policies
- **Test**: Run `node test-migration-009.js` after executing

## Testing

After running ALL migrations:
```bash
npm test
```

This will verify:
- Multi-tenant isolation
- CRM field mapping
- Message partitioning
- Phone number lookups
- AI context storage