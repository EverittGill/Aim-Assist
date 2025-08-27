-- ========================================
-- Aim Assist SaaS - Complete Database Setup
-- Generated: 2025-08-23T16:38:22.886Z
-- ========================================
-- 
-- Run this entire script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qjuajqqchqxjxntofdoz/sql/new
--
-- This will create all tables with proper multi-tenant isolation
-- ========================================


-- ========================================
-- Migration 1: 000_cleanup.sql
-- ========================================

-- Cleanup script to remove existing schema before fresh migration
-- Run this FIRST if you get "already exists" errors

-- Drop all existing policies
DROP POLICY IF EXISTS tenant_isolation ON tenants;
DROP POLICY IF EXISTS user_tenant_isolation ON users;
DROP POLICY IF EXISTS crm_tenant_isolation ON crm_integrations;
DROP POLICY IF EXISTS channel_tenant_isolation ON communication_channels;
DROP POLICY IF EXISTS lead_tenant_isolation ON leads;
DROP POLICY IF EXISTS conversation_tenant_isolation ON conversations;
DROP POLICY IF EXISTS message_tenant_isolation ON messages;
DROP POLICY IF EXISTS ai_config_tenant_isolation ON ai_configurations;
DROP POLICY IF EXISTS automation_tenant_isolation ON automation_rules;
DROP POLICY IF EXISTS activity_read_isolation ON activity_logs;
DROP POLICY IF EXISTS activity_insert_isolation ON activity_logs;
DROP POLICY IF EXISTS usage_tenant_isolation ON usage_tracking;
DROP POLICY IF EXISTS webhook_tenant_isolation ON webhook_logs;

-- Drop all triggers
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_crm_integrations_updated_at ON crm_integrations;
DROP TRIGGER IF EXISTS update_communication_channels_updated_at ON communication_channels;
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS update_ai_configurations_updated_at ON ai_configurations;
DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON automation_rules;
DROP TRIGGER IF EXISTS normalize_lead_phone_trigger ON leads;
DROP TRIGGER IF EXISTS update_conversation_metrics_trigger ON messages;

-- Drop all functions
DROP FUNCTION IF EXISTS auth.tenant_id();
DROP FUNCTION IF EXISTS public.get_tenant_id();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS normalize_phone_number(TEXT);
DROP FUNCTION IF EXISTS normalize_lead_phone();
DROP FUNCTION IF EXISTS update_conversation_metrics();

-- Drop all indexes
DROP INDEX IF EXISTS idx_tenants_slug;
DROP INDEX IF EXISTS idx_tenants_stripe_customer;
DROP INDEX IF EXISTS idx_tenants_is_active;
DROP INDEX IF EXISTS idx_users_tenant_id;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_supabase_auth_id;
DROP INDEX IF EXISTS idx_users_tenant_email;
DROP INDEX IF EXISTS idx_leads_tenant_id;
DROP INDEX IF EXISTS idx_leads_external_id;
DROP INDEX IF EXISTS idx_leads_phone;
DROP INDEX IF EXISTS idx_leads_email;
DROP INDEX IF EXISTS idx_leads_ai_status;
DROP INDEX IF EXISTS idx_leads_assigned_user;
DROP INDEX IF EXISTS idx_leads_do_not_contact;
DROP INDEX IF EXISTS idx_leads_tenant_phone;
DROP INDEX IF EXISTS idx_messages_tenant_id;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_messages_lead_id;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_external_id;
DROP INDEX IF EXISTS idx_messages_status;
DROP INDEX IF EXISTS idx_conversations_tenant_id;
DROP INDEX IF EXISTS idx_conversations_lead_id;
DROP INDEX IF EXISTS idx_conversations_status;
DROP INDEX IF EXISTS idx_conversations_last_message;
DROP INDEX IF EXISTS idx_activity_logs_tenant_id;
DROP INDEX IF EXISTS idx_activity_logs_user_id;
DROP INDEX IF EXISTS idx_activity_logs_created_at;
DROP INDEX IF EXISTS idx_activity_logs_entity;
DROP INDEX IF EXISTS idx_usage_tracking_tenant_id;
DROP INDEX IF EXISTS idx_usage_tracking_created_at;
DROP INDEX IF EXISTS idx_usage_tracking_metric_type;
DROP INDEX IF EXISTS idx_usage_tracking_unbilled;
DROP INDEX IF EXISTS idx_webhook_logs_tenant_id;
DROP INDEX IF EXISTS idx_webhook_logs_created_at;
DROP INDEX IF EXISTS idx_webhook_logs_unprocessed;

-- Drop all tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS usage_tracking CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS ai_configurations CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS communication_channels CASCADE;
DROP TABLE IF EXISTS crm_integrations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ CLEANUP COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'All existing schema objects have been removed.';
    RAISE NOTICE 'You can now run the fresh migration.';
    RAISE NOTICE '';
END $$;


-- ========================================
-- Migration 2: 001_create_tenants.sql
-- ========================================

-- This table stores each company using Aim Assist
-- Each tenant is completely isolated from others
-- Includes subscription and settings for the company

CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  industry VARCHAR(100) DEFAULT 'real_estate',
  
  -- Subscription info
  subscription_status VARCHAR(50) DEFAULT 'trial',
  subscription_plan VARCHAR(50) DEFAULT 'starter',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_ends_at TIMESTAMPTZ,
  
  -- Stripe info
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255),
  
  -- Settings stored as JSONB for flexibility
  settings JSONB DEFAULT '{
    "auto_text_enabled": false,
    "auto_text_sources": [],
    "auto_text_delay_minutes": 5,
    "business_hours_enabled": false,
    "business_hours": {"start": "09:00", "end": "17:00"},
    "timezone": "America/New_York",
    "ai_provider": "gemini",
    "ai_temperature": 0.7,
    "sms_limit_monthly": 1000,
    "lead_limit_monthly": 500
  }'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure subdomain is lowercase and URL-safe
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$')
);

-- Create indexes for common queries
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE INDEX idx_tenants_active ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own tenant
CREATE POLICY tenant_isolation ON tenants
  FOR ALL
  USING (id = current_setting('app.current_tenant_id')::UUID);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at 
  BEFORE UPDATE ON tenants 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE tenants IS 'Multi-tenant organizations using Aim Assist platform';
COMMENT ON COLUMN tenants.subdomain IS 'Unique subdomain for tenant access (e.g., company-name.aim-assist.com)';
COMMENT ON COLUMN tenants.settings IS 'Flexible JSON storage for tenant-specific configuration';


-- ========================================
-- Migration 3: 001_initial_schema.sql
-- ========================================

-- Migration: 001_initial_schema.sql
-- Purpose: Create initial multi-tenant schema for Aim Assist SaaS
-- Date: 2025-01-20

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Tenants table (companies using the platform)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',
    trial_ends_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (users within each tenant)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'agent',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- CRM Integrations table
CREATE TABLE IF NOT EXISTS public.crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    crm_type VARCHAR(50) NOT NULL, -- 'followupboss', 'lofty', etc.
    is_active BOOLEAN DEFAULT true,
    credentials JSONB DEFAULT '{}', -- Encrypted in application layer
    field_mappings JSONB DEFAULT '{}',
    webhook_url TEXT,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, crm_type)
);

-- Communication Channels table (Twilio numbers, etc.)
CREATE TABLE IF NOT EXISTS public.communication_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- 'twilio_sms', 'email', etc.
    is_active BOOLEAN DEFAULT true,
    credentials JSONB DEFAULT '{}', -- Encrypted in application layer
    phone_number VARCHAR(20),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (synced from CRM)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id VARCHAR(255) NOT NULL, -- CRM's lead ID
    crm_type VARCHAR(50) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    source VARCHAR(100),
    tags TEXT[],
    status VARCHAR(50),
    ai_status VARCHAR(50) DEFAULT 'inactive',
    ai_paused_until TIMESTAMPTZ,
    qualification_status JSONB DEFAULT '{}',
    crm_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, external_id, crm_type)
);

-- Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
    message_type VARCHAR(50) NOT NULL, -- 'sms', 'ai', 'manual', etc.
    content TEXT NOT NULL,
    external_id VARCHAR(255), -- Twilio message SID, etc.
    status VARCHAR(50) DEFAULT 'sent',
    error_details JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Configurations table
CREATE TABLE IF NOT EXISTS public.ai_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    ai_provider VARCHAR(50) DEFAULT 'gemini', -- 'gemini', 'claude', 'openai'
    model_settings JSONB DEFAULT '{}',
    system_prompt TEXT,
    initial_outreach_prompt TEXT,
    reply_prompt TEXT,
    qualification_questions JSONB DEFAULT '[]',
    escalation_keywords TEXT[],
    max_messages_before_alert INTEGER DEFAULT 3,
    auto_pause_hours INTEGER DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation Rules table
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    trigger_type VARCHAR(50) NOT NULL, -- 'new_lead', 'tag_added', 'time_based'
    trigger_conditions JSONB DEFAULT '{}',
    actions JSONB DEFAULT '[]',
    execution_delay_minutes INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs table (for audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage Tracking table (for billing)
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'sms_sent', 'ai_response', 'lead_processed'
    quantity INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_external_id ON leads(external_id);
CREATE INDEX idx_leads_ai_status ON leads(ai_status);
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_activity_logs_tenant_id ON activity_logs(tenant_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_usage_tracking_tenant_id ON usage_tracking(tenant_id);
CREATE INDEX idx_usage_tracking_created_at ON usage_tracking(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Create function to get current tenant from JWT
CREATE OR REPLACE FUNCTION auth.tenant_id() 
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        current_setting('app.current_tenant_id', true)::UUID,
        (auth.jwt() ->> 'tenant_id')::UUID
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tenant policies (users can only see their own tenant)
CREATE POLICY tenant_isolation ON tenants
    FOR ALL USING (id = auth.tenant_id());

-- User policies
CREATE POLICY user_tenant_isolation ON users
    FOR ALL USING (tenant_id = auth.tenant_id());

-- CRM Integration policies
CREATE POLICY crm_tenant_isolation ON crm_integrations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Communication Channel policies
CREATE POLICY channel_tenant_isolation ON communication_channels
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Lead policies
CREATE POLICY lead_tenant_isolation ON leads
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Conversation policies
CREATE POLICY conversation_tenant_isolation ON conversations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Message policies
CREATE POLICY message_tenant_isolation ON messages
    FOR ALL USING (tenant_id = auth.tenant_id());

-- AI Configuration policies
CREATE POLICY ai_config_tenant_isolation ON ai_configurations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Automation Rule policies
CREATE POLICY automation_tenant_isolation ON automation_rules
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Activity Log policies
CREATE POLICY activity_tenant_isolation ON activity_logs
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Usage Tracking policies
CREATE POLICY usage_tenant_isolation ON usage_tracking
    FOR ALL USING (tenant_id = auth.tenant_id());

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_integrations_updated_at BEFORE UPDATE ON crm_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_channels_updated_at BEFORE UPDATE ON communication_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configurations_updated_at BEFORE UPDATE ON ai_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA FOR DEVELOPMENT
-- =====================================================

-- Create a demo tenant for testing
INSERT INTO tenants (name, slug, subscription_tier, settings)
VALUES (
    'Demo Company',
    'demo',
    'trial',
    '{"agency_name": "Demo Realty", "notification_phone": "+19047805602"}'
) ON CONFLICT (slug) DO NOTHING;

-- Get the demo tenant ID for further seeding
WITH demo_tenant AS (
    SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1
)
-- Create a demo user
INSERT INTO users (tenant_id, email, password_hash, role, first_name, last_name)
SELECT 
    id,
    'admin@demo.com',
    '$2a$10$5idExPiiSkTtWtN4zEyWjeqo5Tn66a8.eoPjwJYvYBqyZvG4F9yZq', -- password: admin123
    'admin',
    'Demo',
    'Admin'
FROM demo_tenant
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Output success message
DO $$
BEGIN
    RAISE NOTICE 'Initial schema created successfully!';
    RAISE NOTICE 'Demo tenant created with:';
    RAISE NOTICE '  - Email: admin@demo.com';
    RAISE NOTICE '  - Password: admin123';
    RAISE NOTICE '  - Tenant slug: demo';
END $$;


-- ========================================
-- Migration 4: 001_initial_schema_FIXED.sql
-- ========================================

-- Migration: 001_initial_schema_FIXED.sql
-- Purpose: Create production-ready multi-tenant schema for Aim Assist SaaS
-- Date: 2025-01-20
-- Version: 2.1 (Fixed for Supabase permissions)

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- =====================================================
-- CORE TABLES WITH IMPROVEMENTS
-- =====================================================

-- Tenants table (companies using the platform)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    -- Subscription & Billing
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true, -- For suspending accounts
    trial_ends_at TIMESTAMPTZ,
    stripe_customer_id VARCHAR(255) UNIQUE, -- For billing integration
    stripe_subscription_id VARCHAR(255),
    
    -- Usage Limits (tier-based)
    max_leads INTEGER DEFAULT 100,
    max_messages_per_month INTEGER DEFAULT 1000,
    max_users INTEGER DEFAULT 5,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'suspended'))
);

-- Users table (with better auth preparation)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Authentication
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- Will migrate to Supabase Auth later
    supabase_auth_id UUID, -- For future Supabase Auth integration
    
    -- Profile
    role VARCHAR(50) DEFAULT 'agent',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url TEXT,
    
    -- Status & Activity
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    
    -- Settings & Permissions
    settings JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]', -- Granular permissions
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, email),
    CHECK (role IN ('admin', 'manager', 'agent', 'viewer'))
);

-- CRM Integrations table (enhanced monitoring)
CREATE TABLE IF NOT EXISTS public.crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Integration Details
    crm_type VARCHAR(50) NOT NULL, -- 'followupboss', 'lofty', etc.
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false, -- Primary CRM for the tenant
    
    -- Credentials (encrypted in app layer)
    credentials JSONB DEFAULT '{}', -- Consider Supabase Vault in future
    
    -- Configuration
    field_mappings JSONB DEFAULT '{}',
    webhook_url TEXT,
    webhook_secret VARCHAR(255), -- For webhook validation
    sync_frequency_minutes INTEGER DEFAULT 15,
    
    -- Monitoring
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50),
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    consecutive_errors INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, crm_type)
);

-- Communication Channels table (with usage tracking)
CREATE TABLE IF NOT EXISTS public.communication_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Channel Details
    channel_type VARCHAR(50) NOT NULL, -- 'twilio_sms', 'email', etc.
    channel_name VARCHAR(255), -- Friendly name
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    
    -- Credentials & Config
    credentials JSONB DEFAULT '{}',
    phone_number VARCHAR(20) UNIQUE, -- For SMS channels
    email_address VARCHAR(255), -- For email channels
    
    -- Usage Tracking
    monthly_message_count INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 1000,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    total_messages_sent INTEGER DEFAULT 0,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    rate_limit_per_minute INTEGER DEFAULT 10,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (enhanced for production)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- CRM Integration
    external_id VARCHAR(255) NOT NULL, -- CRM's lead ID
    crm_type VARCHAR(50) NOT NULL,
    
    -- Contact Information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20), -- Normalized to E.164 format
    phone_secondary VARCHAR(20),
    
    -- Lead Details
    source VARCHAR(100),
    tags TEXT[],
    status VARCHAR(50),
    score INTEGER DEFAULT 0, -- Lead scoring
    
    -- Assignment
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    
    -- AI Automation
    ai_status VARCHAR(50) DEFAULT 'inactive',
    ai_paused_until TIMESTAMPTZ,
    ai_pause_reason VARCHAR(255),
    qualification_status JSONB DEFAULT '{}',
    
    -- Compliance
    do_not_contact BOOLEAN DEFAULT false,
    do_not_contact_reason VARCHAR(255),
    opted_out_at TIMESTAMPTZ,
    
    -- Activity Tracking
    last_contacted_at TIMESTAMPTZ, -- When we last reached out
    last_response_at TIMESTAMPTZ, -- When they last responded
    last_activity_at TIMESTAMPTZ, -- Any activity
    response_time_minutes INTEGER, -- Avg response time
    
    -- Data Storage
    crm_data JSONB DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, external_id, crm_type),
    CHECK (ai_status IN ('inactive', 'active', 'paused', 'qualified', 'escalated'))
);

-- Conversations table (enhanced tracking)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Conversation Details
    channel_type VARCHAR(50) NOT NULL,
    channel_id UUID REFERENCES communication_channels(id),
    status VARCHAR(50) DEFAULT 'active',
    
    -- Assignment
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metrics
    message_count INTEGER DEFAULT 0,
    ai_message_count INTEGER DEFAULT 0,
    human_message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_ai_message_at TIMESTAMPTZ,
    last_human_message_at TIMESTAMPTZ,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_duration_minutes INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (status IN ('active', 'paused', 'ended', 'archived'))
);

-- Messages table (production ready)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Message Details
    direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
    message_type VARCHAR(50) NOT NULL, -- 'sms', 'ai', 'manual', 'system'
    content TEXT NOT NULL,
    
    -- Sender Information
    sender_type VARCHAR(50), -- 'lead', 'ai', 'user', 'system'
    sender_id UUID, -- References users.id if user sent it
    
    -- External References
    external_id VARCHAR(255), -- Twilio SID, etc.
    
    -- AI Tracking
    ai_model VARCHAR(50), -- 'gemini-pro', 'claude-3', 'gpt-4'
    ai_tokens_used INTEGER,
    ai_cost_cents INTEGER, -- Track cost in cents
    ai_response_time_ms INTEGER,
    
    -- Status & Delivery
    status VARCHAR(50) DEFAULT 'sent',
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_code VARCHAR(50),
    error_details JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (direction IN ('inbound', 'outbound')),
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

-- AI Configurations table (production features)
CREATE TABLE IF NOT EXISTS public.ai_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Configuration Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    -- AI Provider Settings
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    ai_model VARCHAR(100) DEFAULT 'gemini-pro',
    api_key_encrypted TEXT, -- Tenant's own API key (encrypted)
    
    -- Model Parameters
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 256,
    top_p DECIMAL(3,2) DEFAULT 0.9,
    frequency_penalty DECIMAL(3,2) DEFAULT 0.0,
    presence_penalty DECIMAL(3,2) DEFAULT 0.0,
    
    -- Prompts
    system_prompt TEXT,
    initial_outreach_prompt TEXT,
    reply_prompt TEXT,
    
    -- Behavior Settings
    qualification_questions JSONB DEFAULT '[]',
    escalation_keywords TEXT[],
    stop_keywords TEXT[] DEFAULT ARRAY['unsubscribe', 'stop', 'opt out'],
    max_messages_before_alert INTEGER DEFAULT 3,
    auto_pause_hours INTEGER DEFAULT 2,
    response_delay_seconds INTEGER DEFAULT 45,
    
    -- Usage Tracking
    total_messages_sent INTEGER DEFAULT 0,
    total_tokens_used INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (temperature >= 0 AND temperature <= 2),
    CHECK (ai_provider IN ('gemini', 'claude', 'openai', 'custom'))
);

-- Webhook Logs table (for debugging)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Webhook Details
    webhook_type VARCHAR(50) NOT NULL, -- 'twilio_sms', 'crm_update', etc.
    direction VARCHAR(20) NOT NULL, -- 'incoming', 'outgoing'
    url TEXT,
    method VARCHAR(10) DEFAULT 'POST',
    
    -- Request Data
    headers JSONB,
    body JSONB,
    query_params JSONB,
    
    -- Response Data
    status_code INTEGER,
    response_body JSONB,
    response_time_ms INTEGER,
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- References
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    CHECK (direction IN ('incoming', 'outgoing'))
);

-- Automation Rules table (unchanged but included)
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_conditions JSONB DEFAULT '{}',
    actions JSONB DEFAULT '[]',
    execution_delay_minutes INTEGER DEFAULT 0,
    execution_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs table (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    entity_type VARCHAR(50), -- 'lead', 'conversation', 'user', etc.
    entity_id UUID,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- No updated_at - this is append-only
);

-- Usage Tracking table (for accurate billing)
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metric_type VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_cost_cents INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    billed BOOLEAN DEFAULT false,
    billed_at TIMESTAMPTZ,
    CHECK (metric_type IN ('sms_sent', 'sms_received', 'ai_response', 'lead_processed', 'api_call'))
);

-- =====================================================
-- COMPREHENSIVE INDEXES FOR PERFORMANCE
-- =====================================================

-- Tenant indexes
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);

-- User indexes
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(LOWER(email)); -- Case-insensitive email lookup
CREATE INDEX idx_users_supabase_auth_id ON users(supabase_auth_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, LOWER(email));

-- Lead indexes
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_external_id ON leads(external_id);
CREATE INDEX idx_leads_phone ON leads(phone); -- Critical for webhook lookups
CREATE INDEX idx_leads_email ON leads(LOWER(email));
CREATE INDEX idx_leads_ai_status ON leads(ai_status) WHERE ai_status != 'inactive';
CREATE INDEX idx_leads_assigned_user ON leads(assigned_user_id);
CREATE INDEX idx_leads_do_not_contact ON leads(do_not_contact) WHERE do_not_contact = true;
CREATE INDEX idx_leads_tenant_phone ON leads(tenant_id, phone); -- Composite for fast lookups

-- Message indexes
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_messages_status ON messages(status) WHERE status != 'sent';

-- Conversation indexes
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(status) WHERE status = 'active';
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- Activity log indexes
CREATE INDEX idx_activity_logs_tenant_id ON activity_logs(tenant_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- Usage tracking indexes
CREATE INDEX idx_usage_tracking_tenant_id ON usage_tracking(tenant_id);
CREATE INDEX idx_usage_tracking_created_at ON usage_tracking(created_at DESC);
CREATE INDEX idx_usage_tracking_metric_type ON usage_tracking(metric_type);
CREATE INDEX idx_usage_tracking_unbilled ON usage_tracking(tenant_id, billed) WHERE billed = false;

-- Webhook log indexes
CREATE INDEX idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_unprocessed ON webhook_logs(processed) WHERE processed = false;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Function to get current tenant from JWT or context
-- NOTE: Using public schema instead of auth schema to avoid permission issues
CREATE OR REPLACE FUNCTION public.get_tenant_id() 
RETURNS UUID AS $$
DECLARE
    jwt_claims jsonb;
    tenant_id_text text;
BEGIN
    -- First check for app context (for service operations)
    BEGIN
        tenant_id_text := current_setting('app.current_tenant_id', true);
        IF tenant_id_text IS NOT NULL THEN
            RETURN tenant_id_text::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore errors and continue
    END;
    
    -- Try to get JWT claims (this works in Supabase context)
    BEGIN
        jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
        IF jwt_claims IS NOT NULL AND jwt_claims ->> 'tenant_id' IS NOT NULL THEN
            RETURN (jwt_claims ->> 'tenant_id')::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore errors and continue
    END;
    
    -- Return NULL if no tenant context
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tenant policies
CREATE POLICY tenant_isolation ON tenants
    FOR ALL USING (id = public.get_tenant_id());

-- User policies
CREATE POLICY user_tenant_isolation ON users
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- CRM Integration policies
CREATE POLICY crm_tenant_isolation ON crm_integrations
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Communication Channel policies
CREATE POLICY channel_tenant_isolation ON communication_channels
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Lead policies
CREATE POLICY lead_tenant_isolation ON leads
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Conversation policies
CREATE POLICY conversation_tenant_isolation ON conversations
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Message policies
CREATE POLICY message_tenant_isolation ON messages
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- AI Configuration policies
CREATE POLICY ai_config_tenant_isolation ON ai_configurations
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Automation Rule policies
CREATE POLICY automation_tenant_isolation ON automation_rules
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Activity Log policies (append-only)
CREATE POLICY activity_read_isolation ON activity_logs
    FOR SELECT USING (tenant_id = public.get_tenant_id());

CREATE POLICY activity_insert_isolation ON activity_logs
    FOR INSERT WITH CHECK (tenant_id = public.get_tenant_id());

-- Usage Tracking policies
CREATE POLICY usage_tenant_isolation ON usage_tracking
    FOR ALL USING (tenant_id = public.get_tenant_id());

-- Webhook Log policies
CREATE POLICY webhook_tenant_isolation ON webhook_logs
    FOR ALL USING (tenant_id = public.get_tenant_id() OR tenant_id IS NULL);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_integrations_updated_at BEFORE UPDATE ON crm_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_channels_updated_at BEFORE UPDATE ON communication_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configurations_updated_at BEFORE UPDATE ON ai_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to normalize phone numbers to E.164 format
CREATE OR REPLACE FUNCTION normalize_phone_number(phone TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove all non-digit characters
    phone := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Add US country code if 10 digits
    IF length(phone) = 10 THEN
        phone := '1' || phone;
    END IF;
    
    -- Add + prefix for E.164
    IF length(phone) = 11 AND substring(phone, 1, 1) = '1' THEN
        phone := '+' || phone;
    END IF;
    
    RETURN phone;
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize phone numbers on insert/update
CREATE OR REPLACE FUNCTION normalize_lead_phone()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone_number(NEW.phone);
    END IF;
    IF NEW.phone_secondary IS NOT NULL THEN
        NEW.phone_secondary := normalize_phone_number(NEW.phone_secondary);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_lead_phone_trigger
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION normalize_lead_phone();

-- Function to track conversation metrics
CREATE OR REPLACE FUNCTION update_conversation_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update conversation metrics when a message is inserted
    UPDATE conversations
    SET 
        message_count = message_count + 1,
        last_message_at = NEW.created_at,
        ai_message_count = CASE 
            WHEN NEW.message_type = 'ai' THEN ai_message_count + 1 
            ELSE ai_message_count 
        END,
        human_message_count = CASE 
            WHEN NEW.message_type = 'manual' THEN human_message_count + 1 
            ELSE human_message_count 
        END,
        last_ai_message_at = CASE 
            WHEN NEW.message_type = 'ai' THEN NEW.created_at 
            ELSE last_ai_message_at 
        END,
        last_human_message_at = CASE 
            WHEN NEW.message_type = 'manual' THEN NEW.created_at 
            ELSE last_human_message_at 
        END
    WHERE id = NEW.conversation_id;
    
    -- Update lead last activity
    UPDATE leads
    SET 
        last_activity_at = NEW.created_at,
        last_contacted_at = CASE 
            WHEN NEW.direction = 'outbound' THEN NEW.created_at 
            ELSE last_contacted_at 
        END,
        last_response_at = CASE 
            WHEN NEW.direction = 'inbound' THEN NEW.created_at 
            ELSE last_response_at 
        END
    WHERE id = NEW.lead_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_metrics_trigger
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_metrics();

-- =====================================================
-- SEED DATA FOR DEVELOPMENT
-- =====================================================

-- Create a demo tenant for testing
INSERT INTO tenants (
    name, 
    slug, 
    subscription_tier, 
    settings,
    max_leads,
    max_messages_per_month
)
VALUES (
    'Demo Company',
    'demo',
    'trial',
    '{"agency_name": "Demo Realty", "notification_phone": "+19047805602"}',
    100,
    1000
) ON CONFLICT (slug) DO NOTHING;

-- Get the demo tenant ID and create demo data
WITH demo_tenant AS (
    SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1
)
-- Create a demo admin user
INSERT INTO users (
    tenant_id, 
    email, 
    password_hash, 
    role, 
    first_name, 
    last_name,
    email_verified,
    is_active
)
SELECT 
    id,
    'admin@demo.com',
    '$2a$10$5idExPiiSkTtWtN4zEyWjeqo5Tn66a8.eoPjwJYvYBqyZvG4F9yZq', -- password: admin123
    'admin',
    'Demo',
    'Admin',
    true,
    true
FROM demo_tenant
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Create demo AI configuration
WITH demo_tenant AS (
    SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1
)
INSERT INTO ai_configurations (
    tenant_id,
    name,
    description,
    is_active,
    is_default,
    system_prompt,
    initial_outreach_prompt,
    escalation_keywords
)
SELECT
    id,
    'Default AI Configuration',
    'Standard configuration for demo tenant',
    true,
    true,
    'You are Eugenia, a helpful real estate assistant.',
    'Hi {first_name}, I noticed you were interested in properties in {city}. How can I help you today?',
    ARRAY['speak to agent', 'human', 'call me', 'not interested']
FROM demo_tenant
ON CONFLICT DO NOTHING;

-- =====================================================
-- FINAL SETUP MESSAGES
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ SCHEMA CREATED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Created 12 tables with:';
    RAISE NOTICE '   - Full multi-tenant isolation via RLS';
    RAISE NOTICE '   - Comprehensive indexing for performance';
    RAISE NOTICE '   - Phone number normalization';
    RAISE NOTICE '   - Conversation metrics tracking';
    RAISE NOTICE '   - Webhook logging for debugging';
    RAISE NOTICE '   - Usage tracking for billing';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Demo Account Created:';
    RAISE NOTICE '   - Tenant: demo';
    RAISE NOTICE '   - Email: admin@demo.com';
    RAISE NOTICE '   - Password: admin123';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Next Steps:';
    RAISE NOTICE '   1. Test with: npm run test:db';
    RAISE NOTICE '   2. Start backend: npm run dev';
    RAISE NOTICE '   3. Create first real tenant';
    RAISE NOTICE '';
END $$;


-- ========================================
-- Migration 5: 001_initial_schema_optimized.sql
-- ========================================

-- Migration: 001_initial_schema_optimized.sql
-- Purpose: Create production-ready multi-tenant schema for Aim Assist SaaS
-- Date: 2025-01-20
-- Version: 2.0 (Optimized)

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- =====================================================
-- CORE TABLES WITH IMPROVEMENTS
-- =====================================================

-- Tenants table (companies using the platform)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    -- Subscription & Billing
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true, -- For suspending accounts
    trial_ends_at TIMESTAMPTZ,
    stripe_customer_id VARCHAR(255) UNIQUE, -- For billing integration
    stripe_subscription_id VARCHAR(255),
    
    -- Usage Limits (tier-based)
    max_leads INTEGER DEFAULT 100,
    max_messages_per_month INTEGER DEFAULT 1000,
    max_users INTEGER DEFAULT 5,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'suspended'))
);

-- Users table (with better auth preparation)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Authentication
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- Will migrate to Supabase Auth later
    supabase_auth_id UUID, -- For future Supabase Auth integration
    
    -- Profile
    role VARCHAR(50) DEFAULT 'agent',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url TEXT,
    
    -- Status & Activity
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    
    -- Settings & Permissions
    settings JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]', -- Granular permissions
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, email),
    CHECK (role IN ('admin', 'manager', 'agent', 'viewer'))
);

-- CRM Integrations table (enhanced monitoring)
CREATE TABLE IF NOT EXISTS public.crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Integration Details
    crm_type VARCHAR(50) NOT NULL, -- 'followupboss', 'lofty', etc.
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false, -- Primary CRM for the tenant
    
    -- Credentials (encrypted in app layer)
    credentials JSONB DEFAULT '{}', -- Consider Supabase Vault in future
    
    -- Configuration
    field_mappings JSONB DEFAULT '{}',
    webhook_url TEXT,
    webhook_secret VARCHAR(255), -- For webhook validation
    sync_frequency_minutes INTEGER DEFAULT 15,
    
    -- Monitoring
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50),
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    consecutive_errors INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, crm_type)
);

-- Communication Channels table (with usage tracking)
CREATE TABLE IF NOT EXISTS public.communication_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Channel Details
    channel_type VARCHAR(50) NOT NULL, -- 'twilio_sms', 'email', etc.
    channel_name VARCHAR(255), -- Friendly name
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    
    -- Credentials & Config
    credentials JSONB DEFAULT '{}',
    phone_number VARCHAR(20) UNIQUE, -- For SMS channels
    email_address VARCHAR(255), -- For email channels
    
    -- Usage Tracking
    monthly_message_count INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 1000,
    last_reset_at TIMESTAMPTZ DEFAULT NOW(),
    total_messages_sent INTEGER DEFAULT 0,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    rate_limit_per_minute INTEGER DEFAULT 10,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (enhanced for production)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- CRM Integration
    external_id VARCHAR(255) NOT NULL, -- CRM's lead ID
    crm_type VARCHAR(50) NOT NULL,
    
    -- Contact Information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20), -- Normalized to E.164 format
    phone_secondary VARCHAR(20),
    
    -- Lead Details
    source VARCHAR(100),
    tags TEXT[],
    status VARCHAR(50),
    score INTEGER DEFAULT 0, -- Lead scoring
    
    -- Assignment
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    
    -- AI Automation
    ai_status VARCHAR(50) DEFAULT 'inactive',
    ai_paused_until TIMESTAMPTZ,
    ai_pause_reason VARCHAR(255),
    qualification_status JSONB DEFAULT '{}',
    
    -- Compliance
    do_not_contact BOOLEAN DEFAULT false,
    do_not_contact_reason VARCHAR(255),
    opted_out_at TIMESTAMPTZ,
    
    -- Activity Tracking
    last_contacted_at TIMESTAMPTZ, -- When we last reached out
    last_response_at TIMESTAMPTZ, -- When they last responded
    last_activity_at TIMESTAMPTZ, -- Any activity
    response_time_minutes INTEGER, -- Avg response time
    
    -- Data Storage
    crm_data JSONB DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, external_id, crm_type),
    CHECK (ai_status IN ('inactive', 'active', 'paused', 'qualified', 'escalated'))
);

-- Conversations table (enhanced tracking)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Conversation Details
    channel_type VARCHAR(50) NOT NULL,
    channel_id UUID REFERENCES communication_channels(id),
    status VARCHAR(50) DEFAULT 'active',
    
    -- Assignment
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metrics
    message_count INTEGER DEFAULT 0,
    ai_message_count INTEGER DEFAULT 0,
    human_message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_ai_message_at TIMESTAMPTZ,
    last_human_message_at TIMESTAMPTZ,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_duration_minutes INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (status IN ('active', 'paused', 'ended', 'archived'))
);

-- Messages table (production ready)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Message Details
    direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
    message_type VARCHAR(50) NOT NULL, -- 'sms', 'ai', 'manual', 'system'
    content TEXT NOT NULL,
    
    -- Sender Information
    sender_type VARCHAR(50), -- 'lead', 'ai', 'user', 'system'
    sender_id UUID, -- References users.id if user sent it
    
    -- External References
    external_id VARCHAR(255), -- Twilio SID, etc.
    
    -- AI Tracking
    ai_model VARCHAR(50), -- 'gemini-pro', 'claude-3', 'gpt-4'
    ai_tokens_used INTEGER,
    ai_cost_cents INTEGER, -- Track cost in cents
    ai_response_time_ms INTEGER,
    
    -- Status & Delivery
    status VARCHAR(50) DEFAULT 'sent',
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_code VARCHAR(50),
    error_details JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (direction IN ('inbound', 'outbound')),
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

-- AI Configurations table (production features)
CREATE TABLE IF NOT EXISTS public.ai_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Configuration Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    -- AI Provider Settings
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    ai_model VARCHAR(100) DEFAULT 'gemini-pro',
    api_key_encrypted TEXT, -- Tenant's own API key (encrypted)
    
    -- Model Parameters
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 256,
    top_p DECIMAL(3,2) DEFAULT 0.9,
    frequency_penalty DECIMAL(3,2) DEFAULT 0.0,
    presence_penalty DECIMAL(3,2) DEFAULT 0.0,
    
    -- Prompts
    system_prompt TEXT,
    initial_outreach_prompt TEXT,
    reply_prompt TEXT,
    
    -- Behavior Settings
    qualification_questions JSONB DEFAULT '[]',
    escalation_keywords TEXT[],
    stop_keywords TEXT[] DEFAULT ARRAY['unsubscribe', 'stop', 'opt out'],
    max_messages_before_alert INTEGER DEFAULT 3,
    auto_pause_hours INTEGER DEFAULT 2,
    response_delay_seconds INTEGER DEFAULT 45,
    
    -- Usage Tracking
    total_messages_sent INTEGER DEFAULT 0,
    total_tokens_used INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (temperature >= 0 AND temperature <= 2),
    CHECK (ai_provider IN ('gemini', 'claude', 'openai', 'custom'))
);

-- Webhook Logs table (for debugging)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Webhook Details
    webhook_type VARCHAR(50) NOT NULL, -- 'twilio_sms', 'crm_update', etc.
    direction VARCHAR(20) NOT NULL, -- 'incoming', 'outgoing'
    url TEXT,
    method VARCHAR(10) DEFAULT 'POST',
    
    -- Request Data
    headers JSONB,
    body JSONB,
    query_params JSONB,
    
    -- Response Data
    status_code INTEGER,
    response_body JSONB,
    response_time_ms INTEGER,
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- References
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    CHECK (direction IN ('incoming', 'outgoing'))
);

-- Automation Rules table (unchanged but included)
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_conditions JSONB DEFAULT '{}',
    actions JSONB DEFAULT '[]',
    execution_delay_minutes INTEGER DEFAULT 0,
    execution_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs table (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    entity_type VARCHAR(50), -- 'lead', 'conversation', 'user', etc.
    entity_id UUID,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- No updated_at - this is append-only
);

-- Usage Tracking table (for accurate billing)
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metric_type VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_cost_cents INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    billed BOOLEAN DEFAULT false,
    billed_at TIMESTAMPTZ,
    CHECK (metric_type IN ('sms_sent', 'sms_received', 'ai_response', 'lead_processed', 'api_call'))
);

-- =====================================================
-- COMPREHENSIVE INDEXES FOR PERFORMANCE
-- =====================================================

-- Tenant indexes
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);

-- User indexes
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(LOWER(email)); -- Case-insensitive email lookup
CREATE INDEX idx_users_supabase_auth_id ON users(supabase_auth_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, LOWER(email));

-- Lead indexes
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_external_id ON leads(external_id);
CREATE INDEX idx_leads_phone ON leads(phone); -- Critical for webhook lookups
CREATE INDEX idx_leads_email ON leads(LOWER(email));
CREATE INDEX idx_leads_ai_status ON leads(ai_status) WHERE ai_status != 'inactive';
CREATE INDEX idx_leads_assigned_user ON leads(assigned_user_id);
CREATE INDEX idx_leads_do_not_contact ON leads(do_not_contact) WHERE do_not_contact = true;
CREATE INDEX idx_leads_tenant_phone ON leads(tenant_id, phone); -- Composite for fast lookups

-- Message indexes
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_messages_status ON messages(status) WHERE status != 'sent';

-- Conversation indexes
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(status) WHERE status = 'active';
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- Activity log indexes
CREATE INDEX idx_activity_logs_tenant_id ON activity_logs(tenant_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- Usage tracking indexes
CREATE INDEX idx_usage_tracking_tenant_id ON usage_tracking(tenant_id);
CREATE INDEX idx_usage_tracking_created_at ON usage_tracking(created_at DESC);
CREATE INDEX idx_usage_tracking_metric_type ON usage_tracking(metric_type);
CREATE INDEX idx_usage_tracking_unbilled ON usage_tracking(tenant_id, billed) WHERE billed = false;

-- Webhook log indexes
CREATE INDEX idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_unprocessed ON webhook_logs(processed) WHERE processed = false;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Function to get current tenant from JWT or context
CREATE OR REPLACE FUNCTION auth.tenant_id() 
RETURNS UUID AS $$
BEGIN
    -- First check for app context (for service operations)
    IF current_setting('app.current_tenant_id', true) IS NOT NULL THEN
        RETURN current_setting('app.current_tenant_id', true)::UUID;
    END IF;
    
    -- Then check JWT
    IF auth.jwt() IS NOT NULL AND auth.jwt() ->> 'tenant_id' IS NOT NULL THEN
        RETURN (auth.jwt() ->> 'tenant_id')::UUID;
    END IF;
    
    -- Return NULL if no tenant context
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tenant policies
CREATE POLICY tenant_isolation ON tenants
    FOR ALL USING (id = auth.tenant_id());

-- User policies
CREATE POLICY user_tenant_isolation ON users
    FOR ALL USING (tenant_id = auth.tenant_id());

-- CRM Integration policies
CREATE POLICY crm_tenant_isolation ON crm_integrations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Communication Channel policies
CREATE POLICY channel_tenant_isolation ON communication_channels
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Lead policies
CREATE POLICY lead_tenant_isolation ON leads
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Conversation policies
CREATE POLICY conversation_tenant_isolation ON conversations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Message policies
CREATE POLICY message_tenant_isolation ON messages
    FOR ALL USING (tenant_id = auth.tenant_id());

-- AI Configuration policies
CREATE POLICY ai_config_tenant_isolation ON ai_configurations
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Automation Rule policies
CREATE POLICY automation_tenant_isolation ON automation_rules
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Activity Log policies (append-only)
CREATE POLICY activity_read_isolation ON activity_logs
    FOR SELECT USING (tenant_id = auth.tenant_id());

CREATE POLICY activity_insert_isolation ON activity_logs
    FOR INSERT WITH CHECK (tenant_id = auth.tenant_id());

-- Usage Tracking policies
CREATE POLICY usage_tenant_isolation ON usage_tracking
    FOR ALL USING (tenant_id = auth.tenant_id());

-- Webhook Log policies
CREATE POLICY webhook_tenant_isolation ON webhook_logs
    FOR ALL USING (tenant_id = auth.tenant_id() OR tenant_id IS NULL);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_integrations_updated_at BEFORE UPDATE ON crm_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_channels_updated_at BEFORE UPDATE ON communication_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configurations_updated_at BEFORE UPDATE ON ai_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to normalize phone numbers to E.164 format
CREATE OR REPLACE FUNCTION normalize_phone_number(phone TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove all non-digit characters
    phone := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Add US country code if 10 digits
    IF length(phone) = 10 THEN
        phone := '1' || phone;
    END IF;
    
    -- Add + prefix for E.164
    IF length(phone) = 11 AND substring(phone, 1, 1) = '1' THEN
        phone := '+' || phone;
    END IF;
    
    RETURN phone;
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize phone numbers on insert/update
CREATE OR REPLACE FUNCTION normalize_lead_phone()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone_number(NEW.phone);
    END IF;
    IF NEW.phone_secondary IS NOT NULL THEN
        NEW.phone_secondary := normalize_phone_number(NEW.phone_secondary);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_lead_phone_trigger
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION normalize_lead_phone();

-- Function to track conversation metrics
CREATE OR REPLACE FUNCTION update_conversation_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update conversation metrics when a message is inserted
    UPDATE conversations
    SET 
        message_count = message_count + 1,
        last_message_at = NEW.created_at,
        ai_message_count = CASE 
            WHEN NEW.message_type = 'ai' THEN ai_message_count + 1 
            ELSE ai_message_count 
        END,
        human_message_count = CASE 
            WHEN NEW.message_type = 'manual' THEN human_message_count + 1 
            ELSE human_message_count 
        END,
        last_ai_message_at = CASE 
            WHEN NEW.message_type = 'ai' THEN NEW.created_at 
            ELSE last_ai_message_at 
        END,
        last_human_message_at = CASE 
            WHEN NEW.message_type = 'manual' THEN NEW.created_at 
            ELSE last_human_message_at 
        END
    WHERE id = NEW.conversation_id;
    
    -- Update lead last activity
    UPDATE leads
    SET 
        last_activity_at = NEW.created_at,
        last_contacted_at = CASE 
            WHEN NEW.direction = 'outbound' THEN NEW.created_at 
            ELSE last_contacted_at 
        END,
        last_response_at = CASE 
            WHEN NEW.direction = 'inbound' THEN NEW.created_at 
            ELSE last_response_at 
        END
    WHERE id = NEW.lead_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_metrics_trigger
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_metrics();

-- =====================================================
-- SEED DATA FOR DEVELOPMENT
-- =====================================================

-- Create a demo tenant for testing
INSERT INTO tenants (
    name, 
    slug, 
    subscription_tier, 
    settings,
    max_leads,
    max_messages_per_month
)
VALUES (
    'Demo Company',
    'demo',
    'trial',
    '{"agency_name": "Demo Realty", "notification_phone": "+19047805602"}',
    100,
    1000
) ON CONFLICT (slug) DO NOTHING;

-- Get the demo tenant ID and create demo data
WITH demo_tenant AS (
    SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1
)
-- Create a demo admin user
INSERT INTO users (
    tenant_id, 
    email, 
    password_hash, 
    role, 
    first_name, 
    last_name,
    email_verified,
    is_active
)
SELECT 
    id,
    'admin@demo.com',
    '$2a$10$5idExPiiSkTtWtN4zEyWjeqo5Tn66a8.eoPjwJYvYBqyZvG4F9yZq', -- password: admin123
    'admin',
    'Demo',
    'Admin',
    true,
    true
FROM demo_tenant
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Create demo AI configuration
WITH demo_tenant AS (
    SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1
)
INSERT INTO ai_configurations (
    tenant_id,
    name,
    description,
    is_active,
    is_default,
    system_prompt,
    initial_outreach_prompt,
    escalation_keywords
)
SELECT
    id,
    'Default AI Configuration',
    'Standard configuration for demo tenant',
    true,
    true,
    'You are Eugenia, a helpful real estate assistant.',
    'Hi {first_name}, I noticed you were interested in properties in {city}. How can I help you today?',
    ARRAY['speak to agent', 'human', 'call me', 'not interested']
FROM demo_tenant
ON CONFLICT DO NOTHING;

-- =====================================================
-- FINAL SETUP MESSAGES
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ OPTIMIZED SCHEMA CREATED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Created 12 tables with:';
    RAISE NOTICE '   - Full multi-tenant isolation via RLS';
    RAISE NOTICE '   - Comprehensive indexing for performance';
    RAISE NOTICE '   - Phone number normalization';
    RAISE NOTICE '   - Conversation metrics tracking';
    RAISE NOTICE '   - Webhook logging for debugging';
    RAISE NOTICE '   - Usage tracking for billing';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Demo Account Created:';
    RAISE NOTICE '   - Tenant: demo';
    RAISE NOTICE '   - Email: admin@demo.com';
    RAISE NOTICE '   - Password: admin123';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Next Steps:';
    RAISE NOTICE '   1. Test with: npm run test:db';
    RAISE NOTICE '   2. Start backend: npm run dev';
    RAISE NOTICE '   3. Create first real tenant';
    RAISE NOTICE '';
END $$;


-- ========================================
-- Migration 6: 002_create_users.sql
-- ========================================

-- Users belong to tenants (companies)
-- Linked to Supabase Auth for authentication
-- Roles determine what users can do in the system

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_id UUID UNIQUE NOT NULL, -- Links to Supabase auth.users table
  
  -- User info
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  
  -- Role-based access control
  role VARCHAR(50) DEFAULT 'member',
  -- Roles: owner, admin, member, viewer
  
  -- Permissions stored as array for flexibility
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure unique email per tenant
  CONSTRAINT unique_email_per_tenant UNIQUE(tenant_id, email)
);

-- Create indexes for common queries
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see users in their tenant
CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- RLS Policy: Users can update their own profile
CREATE POLICY users_self_update ON users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create user on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- For initial development, create a default tenant if needed
  -- In production, tenant should be created during signup flow
  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    -- Insert user with specified tenant
    INSERT INTO public.users (auth_id, email, tenant_id, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      (NEW.raw_user_meta_data->>'tenant_id')::UUID,
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user record on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add comments for documentation
COMMENT ON TABLE users IS 'Users belonging to tenant organizations';
COMMENT ON COLUMN users.auth_id IS 'References Supabase auth.users.id for authentication';
COMMENT ON COLUMN users.role IS 'User role within tenant: owner, admin, member, viewer';
COMMENT ON COLUMN users.permissions IS 'Additional granular permissions beyond role';


-- ========================================
-- Migration 7: 003_create_crm_integrations.sql
-- ========================================

-- Stores CRM credentials and configuration per tenant
-- Supports multiple CRM types (FUB, Lofty, etc.)
-- Credentials stored encrypted in Supabase Vault

CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- CRM type and status
  crm_type VARCHAR(50) NOT NULL, -- 'fub', 'lofty', 'hubspot', etc.
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false, -- One primary CRM per tenant
  
  -- Encrypted credentials reference
  -- Actual credentials stored in Supabase Vault
  vault_secret_id UUID,
  
  -- Non-sensitive configuration
  config JSONB DEFAULT '{}'::jsonb,
  -- For FUB: {"x_system": "...", "custom_fields": {...}}
  -- For Lofty: {"workspace_id": "...", "api_version": "v2"}
  
  -- Field mappings from CRM to our schema
  field_mappings JSONB DEFAULT '{
    "first_name": "firstName",
    "last_name": "lastName", 
    "email": "email",
    "phone": "phone",
    "source": "source",
    "tags": "tags"
  }'::jsonb,
  
  -- Connection status
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  last_error TEXT,
  connection_verified_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure only one primary CRM per tenant
  CONSTRAINT one_primary_per_tenant UNIQUE(tenant_id, is_primary) WHERE is_primary = true,
  -- Ensure unique CRM type per tenant (can't have 2 FUB integrations)
  CONSTRAINT unique_crm_per_tenant UNIQUE(tenant_id, crm_type) WHERE deleted_at IS NULL
);

-- Create indexes
CREATE INDEX idx_crm_tenant ON crm_integrations(tenant_id);
CREATE INDEX idx_crm_type ON crm_integrations(crm_type);
CREATE INDEX idx_crm_active ON crm_integrations(tenant_id, is_active) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY crm_tenant_isolation ON crm_integrations
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add updated_at trigger
CREATE TRIGGER update_crm_integrations_updated_at 
  BEFORE UPDATE ON crm_integrations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to store CRM credentials securely
CREATE OR REPLACE FUNCTION store_crm_credentials(
  p_tenant_id UUID,
  p_crm_type VARCHAR,
  p_credentials JSONB
)
RETURNS UUID AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Generate unique secret ID
  v_secret_id := gen_random_uuid();
  
  -- Store in vault (this is pseudocode - actual implementation depends on Supabase Vault setup)
  -- In production, use Supabase Vault or similar secure storage
  -- For now, we'll store in a separate encrypted table
  
  INSERT INTO vault_secrets (id, tenant_id, secret_type, encrypted_data)
  VALUES (
    v_secret_id,
    p_tenant_id,
    'crm_credentials',
    pgp_sym_encrypt(p_credentials::text, current_setting('app.encryption_key'))
  );
  
  RETURN v_secret_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create vault_secrets table for credential storage
CREATE TABLE IF NOT EXISTS vault_secrets (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_type VARCHAR(50) NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Strict RLS on vault
ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_tenant_isolation ON vault_secrets
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Create leads table for cached CRM data
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  crm_integration_id UUID REFERENCES crm_integrations(id) ON DELETE SET NULL,
  crm_lead_id VARCHAR(255) NOT NULL, -- Original ID from CRM
  
  -- Standard lead fields
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  
  -- Lead details
  source VARCHAR(100),
  tags TEXT[],
  stage VARCHAR(50),
  assigned_to VARCHAR(255),
  
  -- AI engagement status
  ai_status VARCHAR(50) DEFAULT 'inactive', -- inactive, active, paused, completed
  ai_paused_until TIMESTAMPTZ,
  ai_conversation_count INTEGER DEFAULT 0,
  ai_last_contact_at TIMESTAMPTZ,
  
  -- Original CRM data for reference
  crm_data JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Unique CRM ID per tenant
  CONSTRAINT unique_crm_lead_per_tenant UNIQUE(tenant_id, crm_lead_id)
);

-- Create indexes for leads
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_ai_status ON leads(tenant_id, ai_status);
CREATE INDEX idx_leads_crm ON leads(crm_integration_id, crm_lead_id);

-- Enable RLS on leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_tenant_isolation ON leads
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add comments
COMMENT ON TABLE crm_integrations IS 'CRM connections and configuration per tenant';
COMMENT ON COLUMN crm_integrations.vault_secret_id IS 'Reference to encrypted credentials in vault';
COMMENT ON TABLE leads IS 'Cached lead data from CRM with AI engagement tracking';


-- ========================================
-- Migration 8: 004_create_conversations_messages.sql
-- ========================================

-- Conversations and messages tables for SMS communication tracking

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Conversation status
  status VARCHAR(50) DEFAULT 'active', -- active, paused, completed, archived
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Metrics
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_ai_message_at TIMESTAMPTZ,
  last_human_message_at TIMESTAMPTZ,
  
  -- Qualification tracking
  qualification_status VARCHAR(50) DEFAULT 'not_qualified',
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message details
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  sender_type VARCHAR(20) NOT NULL, -- lead, ai, human
  content TEXT NOT NULL,
  
  -- SMS details
  phone_from VARCHAR(20),
  phone_to VARCHAR(20),
  twilio_sid VARCHAR(100),
  twilio_status VARCHAR(50),
  
  -- AI details (if AI generated)
  ai_provider VARCHAR(50), -- claude, gemini, gpt4
  ai_model VARCHAR(100),
  ai_temperature DECIMAL(3,2),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

-- Templates table for prompt management
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Template details
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- initial_outreach, conversation_reply, follow_up
  content TEXT NOT NULL,
  variables TEXT[], -- List of supported variables
  
  -- Usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique name per tenant
  CONSTRAINT unique_template_name_per_tenant UNIQUE(tenant_id, name)
);

-- Phone numbers table for Twilio numbers
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Phone details
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  friendly_name VARCHAR(100),
  
  -- Twilio details
  twilio_sid VARCHAR(100),
  twilio_subaccount_sid VARCHAR(100),
  capabilities JSONB DEFAULT '{"sms": true, "voice": false, "mms": false}'::jsonb,
  
  -- Usage
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  monthly_cost DECIMAL(10,2),
  
  -- Metadata
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  
  -- One primary number per tenant
  CONSTRAINT one_primary_phone_per_tenant UNIQUE(tenant_id, is_primary) WHERE is_primary = true
);

-- Auto-text rules table
CREATE TABLE IF NOT EXISTS auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule configuration
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  -- Conditions (all must match)
  conditions JSONB NOT NULL,
  -- Example: {
  --   "source": ["website", "zillow"],
  --   "tags": {"contains": ["hot"]},
  --   "time_since_created": {"max_minutes": 5}
  -- }
  
  -- Actions
  template_id UUID REFERENCES templates(id),
  delay_minutes INTEGER DEFAULT 1,
  
  -- Business hours
  respect_business_hours BOOLEAN DEFAULT true,
  
  -- Metrics
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(tenant_id, status);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_type ON templates(tenant_id, type);

CREATE INDEX idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX idx_auto_text_rules_tenant ON auto_text_rules(tenant_id, is_active);

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY messages_tenant_isolation ON messages
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY templates_tenant_isolation ON templates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY phone_numbers_tenant_isolation ON phone_numbers
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY auto_text_rules_tenant_isolation ON auto_text_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at 
  BEFORE UPDATE ON templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_text_rules_updated_at 
  BEFORE UPDATE ON auto_text_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE conversations IS 'SMS conversation threads with leads';
COMMENT ON TABLE messages IS 'Individual SMS messages within conversations';
COMMENT ON TABLE templates IS 'Customizable prompt templates for AI responses';
COMMENT ON TABLE phone_numbers IS 'Twilio phone numbers owned by tenants';
COMMENT ON TABLE auto_text_rules IS 'Automated text message rules based on lead attributes';


-- ========================================
-- Migration 9: 005_create_usage_billing.sql
-- ========================================

-- Usage tracking and billing related tables

-- Usage metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_type VARCHAR(50) NOT NULL, -- sms_sent, sms_received, lead_created, ai_generation
  quantity INTEGER DEFAULT 1,
  
  -- Associated resources
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  -- Billing period
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  
  -- Cost tracking
  unit_cost DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing history table
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Invoice details
  stripe_invoice_id VARCHAR(255) UNIQUE,
  invoice_number VARCHAR(50),
  
  -- Billing period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Amounts
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  
  -- Payment
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed, cancelled
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  
  -- Line items stored as JSONB
  line_items JSONB NOT NULL,
  -- Example: [
  --   {"description": "Starter Plan", "amount": 99.00},
  --   {"description": "Additional SMS (500)", "amount": 25.00}
  -- ]
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE
);

-- Plan limits table
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Plan details
  plan_name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  
  -- Limits
  max_leads_monthly INTEGER,
  max_sms_monthly INTEGER,
  max_users INTEGER,
  max_phone_numbers INTEGER,
  max_crm_integrations INTEGER DEFAULT 1,
  
  -- Features
  features JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "auto_text": true,
  --   "ai_providers": ["gemini", "claude", "gpt4"],
  --   "custom_templates": true,
  --   "api_access": false,
  --   "white_label": false
  -- }
  
  -- Pricing
  monthly_price DECIMAL(10,2) NOT NULL,
  annual_price DECIMAL(10,2),
  overage_sms_price DECIMAL(10,4) DEFAULT 0.05,
  overage_lead_price DECIMAL(10,2) DEFAULT 0.50,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plan_limits (plan_name, display_name, max_leads_monthly, max_sms_monthly, max_users, max_phone_numbers, monthly_price, annual_price, features) VALUES
('starter', 'Starter', 100, 500, 2, 1, 99.00, 990.00, 
  '{"auto_text": true, "ai_providers": ["gemini"], "custom_templates": true, "api_access": false}'::jsonb),
('growth', 'Growth', 500, 2500, 5, 3, 299.00, 2990.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude"], "custom_templates": true, "api_access": true}'::jsonb),
('scale', 'Scale', 2000, 10000, 20, 10, 799.00, 7990.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude", "gpt4"], "custom_templates": true, "api_access": true, "white_label": true}'::jsonb),
('enterprise', 'Enterprise', NULL, NULL, NULL, NULL, 0.00, 0.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude", "gpt4"], "custom_templates": true, "api_access": true, "white_label": true, "custom_contract": true}'::jsonb);

-- Notifications table for system alerts
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification details
  type VARCHAR(50) NOT NULL, -- usage_limit, payment_failed, lead_qualified, system_update
  severity VARCHAR(20) DEFAULT 'info', -- info, warning, error, critical
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Action
  action_url TEXT,
  action_label VARCHAR(100),
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_usage_metrics_tenant ON usage_metrics(tenant_id, billing_period_start);
CREATE INDEX idx_usage_metrics_type ON usage_metrics(tenant_id, metric_type);
CREATE INDEX idx_billing_history_tenant ON billing_history(tenant_id);
CREATE INDEX idx_billing_history_status ON billing_history(status);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id, is_read);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Enable RLS
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY usage_metrics_tenant_isolation ON usage_metrics
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY billing_history_tenant_isolation ON billing_history
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric_type VARCHAR,
  p_period_start DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)
)
RETURNS TABLE(
  current_usage INTEGER,
  plan_limit INTEGER,
  is_over_limit BOOLEAN,
  overage_amount INTEGER
) AS $$
DECLARE
  v_plan VARCHAR;
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  -- Get tenant's plan
  SELECT subscription_plan INTO v_plan
  FROM tenants WHERE id = p_tenant_id;
  
  -- Get plan limit
  CASE p_metric_type
    WHEN 'sms_sent' THEN
      SELECT max_sms_monthly INTO v_limit
      FROM plan_limits WHERE plan_name = v_plan;
    WHEN 'lead_created' THEN
      SELECT max_leads_monthly INTO v_limit
      FROM plan_limits WHERE plan_name = v_plan;
    ELSE
      v_limit := NULL;
  END CASE;
  
  -- Get current usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_usage
  FROM usage_metrics
  WHERE tenant_id = p_tenant_id
    AND metric_type = p_metric_type
    AND billing_period_start = p_period_start;
  
  -- Return results
  RETURN QUERY SELECT
    v_usage AS current_usage,
    v_limit AS plan_limit,
    CASE WHEN v_limit IS NULL THEN FALSE ELSE v_usage > v_limit END AS is_over_limit,
    CASE WHEN v_limit IS NULL THEN 0 ELSE GREATEST(0, v_usage - v_limit) END AS overage_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers
CREATE TRIGGER update_plan_limits_updated_at 
  BEFORE UPDATE ON plan_limits 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE usage_metrics IS 'Tracks usage for billing and limit enforcement';
COMMENT ON TABLE billing_history IS 'Invoice and payment history';
COMMENT ON TABLE plan_limits IS 'Subscription plan definitions and limits';
COMMENT ON TABLE notifications IS 'System notifications for users';
COMMENT ON FUNCTION check_usage_limit IS 'Check if tenant has exceeded plan limits';


-- ========================================
-- Migration 10: 006_add_qualification_tracking.sql
-- ========================================

-- Supplemental migration for qualification tracking
-- Adds fields identified from Eugenia bot analysis
-- Tracks lead qualification progress in detail

-- Add qualification tracking fields to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS timeline_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS timeline_response TEXT,
ADD COLUMN IF NOT EXISTS agent_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_response TEXT,
ADD COLUMN IF NOT EXISTS financing_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS financing_response TEXT,
ADD COLUMN IF NOT EXISTS phone_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduling_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS high_engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_complete_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS agent_notified_at TIMESTAMPTZ;

-- Add custom field mappings to CRM integrations
ALTER TABLE crm_integrations 
ADD COLUMN IF NOT EXISTS custom_field_mappings JSONB DEFAULT '{
  "ai_status_field": "customEugeniaTalkingStatus",
  "conversation_link_field": "customAimAssist", 
  "pause_until_field": "customEugeniaPausedUntil",
  "qualification_status_field": "customQualificationStatus"
}'::jsonb;

-- Add notification settings to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_after_messages INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS notification_pause_hours INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notification_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "sms_enabled": true,
  "email_enabled": false,
  "webhook_enabled": false,
  "qualified_lead_alert": true,
  "escalation_alert": true,
  "opt_out_alert": true
}'::jsonb;

-- Add template enhancements
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 160,
ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS system_prompt TEXT,
ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;

-- Add message tracking fields
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS qualification_detected JSONB,
ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false;

-- Create qualification_events table for tracking
CREATE TABLE IF NOT EXISTS qualification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- timeline_answered, agent_status_answered, etc.
  event_data JSONB,
  detected_from_message UUID REFERENCES messages(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT unique_event_per_conversation UNIQUE(conversation_id, event_type)
);

-- Create notification_queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- qualified_lead, escalation, opt_out
  priority INTEGER DEFAULT 5,
  channel VARCHAR(20) NOT NULL, -- sms, email, webhook
  recipient VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_qualification_events_tenant ON qualification_events(tenant_id);
CREATE INDEX idx_qualification_events_conversation ON qualification_events(conversation_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status, scheduled_for);
CREATE INDEX idx_notification_queue_tenant ON notification_queue(tenant_id);

-- Enable RLS on new tables
ALTER TABLE qualification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY qualification_events_tenant_isolation ON qualification_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY notification_queue_tenant_isolation ON notification_queue
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers for updated_at on notification_queue
CREATE TRIGGER update_notification_queue_updated_at 
  BEFORE UPDATE ON notification_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE qualification_events IS 'Tracks qualification milestones detected in conversations';
COMMENT ON TABLE notification_queue IS 'Queue for SMS, email, and webhook notifications to agents';
COMMENT ON COLUMN conversations.timeline_status IS 'Whether lead has answered timeline question';
COMMENT ON COLUMN conversations.agent_status IS 'Whether lead has indicated agent status';
COMMENT ON COLUMN conversations.financing_status IS 'Whether lead has provided financing info';
COMMENT ON COLUMN conversations.high_engagement_score IS 'Engagement score based on message count and qualification answers';
COMMENT ON COLUMN tenants.notification_phone IS 'Primary phone number for agent notifications';
COMMENT ON COLUMN tenants.notification_preferences IS 'JSON configuration for notification channels and types';


-- ========================================
-- Migration 11: 007_brokerage_hierarchy.sql
-- ========================================

-- Migration: 007_brokerage_hierarchy.sql
-- Purpose: Add support for brokerage/agent hierarchy in tenants table
-- Date: 2025-01-22

-- Add new columns to tenants table for hierarchy support
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'standalone',
ADD COLUMN IF NOT EXISTS parent_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS subdomain VARCHAR(255),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Create index for parent-child lookups
CREATE INDEX IF NOT EXISTS idx_tenants_parent_id ON tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON tenants(type);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);

-- Update settings JSONB to include new fields if not present
UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{twilio_phone}',
    'null'::jsonb,
    false
)
WHERE NOT (settings ? 'twilio_phone');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{notification_phone}',
    'null'::jsonb,
    false
)
WHERE NOT (settings ? 'notification_phone');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{lead_sync_tags}',
    '[]'::jsonb,
    false
)
WHERE NOT (settings ? 'lead_sync_tags');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{crm_config}',
    '{}'::jsonb,
    false
)
WHERE NOT (settings ? 'crm_config');

-- Create phone_numbers table for multi-tenant phone management
CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    provider_sid VARCHAR(255), -- Twilio SID
    capabilities JSONB DEFAULT '{"sms": true, "mms": true, "voice": false}',
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone_number)
);

-- Create index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant_id ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_active ON phone_numbers(is_active);

-- Create campaign_metrics table for nurturing tracking
CREATE TABLE IF NOT EXISTS public.campaign_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_type VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'sent', 'opened', 'clicked', 'replied'
    message_content TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for campaign metrics
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_tenant_id ON campaign_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_lead_id ON campaign_metrics(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_type ON campaign_metrics(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_timestamp ON campaign_metrics(timestamp);

-- Add property viewing tracking to leads metadata
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS viewing_history JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS nurturing_status VARCHAR(50) DEFAULT 'active';

-- Create function to get tenant hierarchy
CREATE OR REPLACE FUNCTION get_tenant_hierarchy(tenant_uuid UUID)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name VARCHAR(255),
    tenant_type VARCHAR(50),
    parent_id UUID,
    level INTEGER
) AS $$
WITH RECURSIVE hierarchy AS (
    -- Base case: start with the given tenant
    SELECT 
        id as tenant_id,
        name as tenant_name,
        type as tenant_type,
        parent_tenant_id as parent_id,
        0 as level
    FROM tenants 
    WHERE id = tenant_uuid
    
    UNION ALL
    
    -- Recursive case: get children
    SELECT 
        t.id,
        t.name,
        t.type,
        t.parent_tenant_id,
        h.level + 1
    FROM tenants t
    INNER JOIN hierarchy h ON t.parent_tenant_id = h.tenant_id
)
SELECT * FROM hierarchy ORDER BY level;
$$ LANGUAGE SQL;

-- Create function to check if tenant can access lead
CREATE OR REPLACE FUNCTION can_tenant_access_lead(
    check_tenant_id UUID,
    check_lead_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    lead_tenant_id UUID;
    tenant_type VARCHAR(50);
    parent_id UUID;
BEGIN
    -- Get the lead's tenant
    SELECT tenant_id INTO lead_tenant_id 
    FROM leads 
    WHERE id = check_lead_id;
    
    -- Direct match
    IF lead_tenant_id = check_tenant_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check if checking tenant is a brokerage parent
    SELECT type, parent_tenant_id INTO tenant_type, parent_id
    FROM tenants 
    WHERE id = check_tenant_id;
    
    -- If brokerage, check if lead belongs to any of its agents
    IF tenant_type = 'brokerage' THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = check_tenant_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    -- If agent, check if lead belongs to sibling agent (same brokerage)
    IF parent_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = parent_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS if not already enabled
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS tenant_hierarchy_select ON public.tenants;
DROP POLICY IF EXISTS brokerage_lead_access ON public.leads;

-- Policy: Users can see their own tenant and children
CREATE POLICY tenant_hierarchy_select ON public.tenants
    FOR SELECT
    USING (
        id IN (
            SELECT tenant_id FROM get_tenant_hierarchy(auth.uid()::UUID)
        )
    );

-- Policy: Brokerages can see their agents' leads
CREATE POLICY brokerage_lead_access ON public.leads
    FOR SELECT
    USING (
        can_tenant_access_lead(auth.uid()::UUID, id)
    );

-- Create view for easy agent lookup
CREATE OR REPLACE VIEW brokerage_agents AS
SELECT 
    b.id as brokerage_id,
    b.name as brokerage_name,
    a.id as agent_id,
    a.name as agent_name,
    a.email as agent_email,
    a.settings->>'notification_phone' as agent_phone,
    a.created_at as joined_at
FROM tenants b
LEFT JOIN tenants a ON a.parent_tenant_id = b.id
WHERE b.type = 'brokerage'
AND (a.type = 'agent' OR a.type IS NULL);

-- Grant permissions
GRANT SELECT ON brokerage_agents TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_hierarchy TO authenticated;
GRANT EXECUTE ON FUNCTION can_tenant_access_lead TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN tenants.type IS 'Type of tenant: standalone, brokerage, or agent';
COMMENT ON COLUMN tenants.parent_tenant_id IS 'For agents, references their parent brokerage';
COMMENT ON COLUMN tenants.subdomain IS 'Unique subdomain for tenant access';
COMMENT ON TABLE phone_numbers IS 'Manages Twilio phone numbers per tenant';
COMMENT ON TABLE campaign_metrics IS 'Tracks nurturing campaign performance';
COMMENT ON FUNCTION get_tenant_hierarchy IS 'Returns full hierarchy tree for a tenant';
COMMENT ON FUNCTION can_tenant_access_lead IS 'Checks if tenant has permission to access a lead';


-- ========================================
-- Migration 12: 008_security_fixes.sql
-- ========================================

-- Migration: 008_security_fixes.sql
-- Purpose: Fix security issues identified by Supabase linter
-- Date: 2025-01-22

-- =====================================================
-- 1. Enable RLS on campaign_metrics table
-- =====================================================
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for campaign_metrics
CREATE POLICY campaign_metrics_tenant_isolation ON public.campaign_metrics
    FOR ALL
    USING (tenant_id = auth.uid()::UUID OR 
           tenant_id IN (SELECT id FROM tenants WHERE parent_tenant_id = auth.uid()::UUID));

-- =====================================================
-- 2. Fix the brokerage_agents view (remove SECURITY DEFINER)
-- =====================================================
DROP VIEW IF EXISTS brokerage_agents;

CREATE VIEW brokerage_agents AS
SELECT 
    b.id as brokerage_id,
    b.name as brokerage_name,
    a.id as agent_id,
    a.name as agent_name,
    a.email as agent_email,
    a.settings->>'notification_phone' as agent_phone,
    a.created_at as joined_at
FROM tenants b
LEFT JOIN tenants a ON a.parent_tenant_id = b.id
WHERE b.type = 'brokerage'
AND (a.type = 'agent' OR a.type IS NULL);

-- Grant permissions
GRANT SELECT ON brokerage_agents TO authenticated;

-- =====================================================
-- 3. Fix function search paths for security
-- =====================================================

-- Fix get_tenant_hierarchy function
CREATE OR REPLACE FUNCTION get_tenant_hierarchy(tenant_uuid UUID)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name VARCHAR(255),
    tenant_type VARCHAR(50),
    parent_id UUID,
    level INTEGER
) 
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE hierarchy AS (
    -- Base case: start with the given tenant
    SELECT 
        id as tenant_id,
        name as tenant_name,
        type as tenant_type,
        parent_tenant_id as parent_id,
        0 as level
    FROM tenants 
    WHERE id = tenant_uuid
    
    UNION ALL
    
    -- Recursive case: get children
    SELECT 
        t.id,
        t.name,
        t.type,
        t.parent_tenant_id,
        h.level + 1
    FROM tenants t
    INNER JOIN hierarchy h ON t.parent_tenant_id = h.tenant_id
)
SELECT * FROM hierarchy ORDER BY level;
$$ LANGUAGE SQL;

-- Fix can_tenant_access_lead function
CREATE OR REPLACE FUNCTION can_tenant_access_lead(
    check_tenant_id UUID,
    check_lead_id UUID
) RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    lead_tenant_id UUID;
    tenant_type VARCHAR(50);
    parent_id UUID;
BEGIN
    -- Get the lead's tenant
    SELECT tenant_id INTO lead_tenant_id 
    FROM leads 
    WHERE id = check_lead_id;
    
    -- Direct match
    IF lead_tenant_id = check_tenant_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check if checking tenant is a brokerage parent
    SELECT type, parent_tenant_id INTO tenant_type, parent_id
    FROM tenants 
    WHERE id = check_tenant_id;
    
    -- If brokerage, check if lead belongs to any of its agents
    IF tenant_type = 'brokerage' THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = check_tenant_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    -- If agent, check if lead belongs to sibling agent (same brokerage)
    IF parent_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = parent_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Fix other functions mentioned in warnings
CREATE OR REPLACE FUNCTION get_tenant_id(tenant_slug text)
RETURNS UUID 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM tenants WHERE slug = tenant_slug;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_phone_number(phone text)
RETURNS text 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Remove all non-numeric characters
    phone := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Add country code if missing (assuming US)
    IF length(phone) = 10 THEN
        phone := '1' || phone;
    END IF;
    
    -- Add + prefix
    IF NOT phone ~ '^[+]' THEN
        phone := '+' || phone;
    END IF;
    
    RETURN phone;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_lead_phone()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone_number(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_conversation_metrics()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update conversation metrics when messages are added
    UPDATE conversations 
    SET 
        message_count = (
            SELECT COUNT(*) 
            FROM messages 
            WHERE conversation_id = NEW.conversation_id
        ),
        last_message_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. Move pg_trgm extension to extensions schema
-- =====================================================
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Try to move the extension (this might fail if extension is in use)
-- If it fails, you may need to recreate indexes after moving
DO $$
BEGIN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
EXCEPTION
    WHEN OTHERS THEN
        -- If moving fails, at least document it
        RAISE NOTICE 'Could not move pg_trgm extension. Manual intervention may be needed: %', SQLERRM;
END $$;

-- =====================================================
-- 5. Add missing RLS policies for other tables if needed
-- =====================================================

-- Enable RLS on phone_numbers table
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY phone_numbers_tenant_isolation ON public.phone_numbers
    FOR ALL
    USING (tenant_id = auth.uid()::UUID OR 
           tenant_id IN (SELECT id FROM tenants WHERE parent_tenant_id = auth.uid()::UUID));

-- =====================================================
-- Verification
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Security fixes applied:';
    RAISE NOTICE '  - RLS enabled on campaign_metrics and phone_numbers';
    RAISE NOTICE '  - Functions updated with secure search_path';
    RAISE NOTICE '  - brokerage_agents view recreated without SECURITY DEFINER';
    RAISE NOTICE '  - Extension migration attempted (check manually if failed)';
END $$;


-- ========================================
-- Migration 13: 009_add_user_id_to_tenants.sql
-- ========================================

-- Migration: 009_add_user_id_to_tenants.sql
-- Purpose: Add user_id column to tenants table for proper auth integration
-- Date: 2025-01-22
-- Description: This migration bridges the gap between Supabase auth and our tenant system
--              by adding a direct link from tenants to auth users

-- Add user_id column to link tenants to Supabase auth users
-- This is for the primary owner/creator of the tenant
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS twilio_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS lead_tags TEXT[] DEFAULT ARRAY['Direct Connect', 'PPC'];

-- Create index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN tenants.user_id IS 'Primary owner user from Supabase auth - used for initial tenant creation and ownership';
COMMENT ON COLUMN tenants.twilio_phone IS 'Twilio phone number for sending SMS';
COMMENT ON COLUMN tenants.notification_phone IS 'Phone number to receive notifications';
COMMENT ON COLUMN tenants.lead_tags IS 'Tags to filter leads for auto-text functionality';

-- Update RLS policies to allow users to see their own tenant
DROP POLICY IF EXISTS tenants_user_access ON tenants;
CREATE POLICY tenants_user_access ON tenants
    FOR ALL
    USING (
        user_id = auth.uid() OR 
        id IN (
            SELECT tenant_id FROM users WHERE auth_id = auth.uid()
        )
    );

-- Ensure the policy is enabled
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;


-- ========================================
-- Migration 14: 009_add_user_id_to_tenants_FIXED.sql
-- ========================================

-- Migration: 009_add_user_id_to_tenants_FIXED.sql
-- Purpose: Add user_id column to tenants table for proper auth integration
-- Date: 2025-01-22
-- Description: This migration bridges the gap between Supabase auth and our tenant system
--              by adding a direct link from tenants to auth users

-- First ensure the users table has the auth_id column
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- Add user_id column to link tenants to Supabase auth users
-- This is for the primary owner/creator of the tenant
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS twilio_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS lead_tags TEXT[] DEFAULT ARRAY['Direct Connect', 'PPC'];

-- Create index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN tenants.user_id IS 'Primary owner user from Supabase auth - used for initial tenant creation and ownership';
COMMENT ON COLUMN tenants.twilio_phone IS 'Twilio phone number for sending SMS';
COMMENT ON COLUMN tenants.notification_phone IS 'Phone number to receive notifications';
COMMENT ON COLUMN tenants.lead_tags IS 'Tags to filter leads for auto-text functionality';

-- Update RLS policies to allow users to see their own tenant
DROP POLICY IF EXISTS tenants_user_access ON tenants;
CREATE POLICY tenants_user_access ON tenants
    FOR ALL
    USING (
        user_id = auth.uid() OR /
        id IN (
            SELECT tenant_id FROM users WHERE auth_id = auth.uid()
        )
    );

-- Ensure the policy is enabled
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;


-- ========================================
-- Migration 15: 010_add_crm_type_support.sql
-- ========================================

-- Migration: Add CRM Type Support for Multi-CRM Architecture
-- Purpose: Support multiple CRM systems (FUB, Lofty, Pipedrive, etc.)
-- Date: 2025-01-23

-- Add CRM type enum
CREATE TYPE crm_type AS ENUM ('fub', 'lofty', 'pipedrive', 'salesforce', 'hubspot');

-- Update tenants table to track which CRM they use
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS crm_type crm_type DEFAULT 'fub',
ADD COLUMN IF NOT EXISTS crm_api_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS crm_user_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 5;

-- Update leads table to store CRM-specific IDs
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS fub_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS lofty_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS pipedrive_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS salesforce_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS hubspot_lead_id VARCHAR(255);

-- Create indexes for fast CRM ID lookups
CREATE INDEX IF NOT EXISTS idx_leads_fub_id ON leads(fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lofty_id ON leads(lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pipedrive_id ON leads(pipedrive_lead_id) WHERE pipedrive_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesforce_id ON leads(salesforce_lead_id) WHERE salesforce_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_hubspot_id ON leads(hubspot_lead_id) WHERE hubspot_lead_id IS NOT NULL;

-- Add composite index for tenant + CRM ID lookups
CREATE INDEX IF NOT EXISTS idx_leads_tenant_fub ON leads(tenant_id, fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant_lofty ON leads(tenant_id, lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;

-- Create sync log table to track synchronization history
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
  crm_type crm_type NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed'
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for sync log queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant ON sync_logs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status, started_at DESC);

-- Create CRM field mappings table for flexible field mapping
CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  crm_type crm_type NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'lead', 'contact', 'activity', etc.
  crm_field VARCHAR(255) NOT NULL,
  supabase_field VARCHAR(255) NOT NULL,
  field_type VARCHAR(50), -- 'string', 'number', 'date', 'boolean', 'json'
  is_required BOOLEAN DEFAULT false,
  transform_function TEXT, -- Optional JS/SQL function for data transformation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, crm_type, entity_type, crm_field)
);

-- Add missing tables if they don't exist
CREATE TABLE IF NOT EXISTS lead_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  qualification_score INTEGER DEFAULT 0,
  timeline_status VARCHAR(50),
  budget_status VARCHAR(50),
  financing_status VARCHAR(50),
  agent_status VARCHAR(50),
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, lead_id)
);

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  ai_responses INTEGER DEFAULT 0,
  extraction_jobs INTEGER DEFAULT 0,
  sync_operations INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, metric_date)
);

-- Add extraction confidence tracking
CREATE TABLE IF NOT EXISTS extraction_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  extraction_log_id UUID REFERENCES extraction_logs(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  extracted_value TEXT,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_extraction_confidence_lead (lead_id, created_at DESC)
);

-- Migrate existing data (map crm_lead_id to fub_lead_id for existing records)
UPDATE leads 
SET fub_lead_id = crm_lead_id 
WHERE crm_lead_id IS NOT NULL 
  AND fub_lead_id IS NULL
  AND tenant_id IN (SELECT id FROM tenants WHERE crm_type = 'fub' OR crm_type IS NULL);

-- Set default CRM type for existing tenants to 'fub'
UPDATE tenants 
SET crm_type = 'fub' 
WHERE crm_type IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN tenants.crm_type IS 'Type of CRM system the tenant uses';
COMMENT ON COLUMN tenants.crm_api_config IS 'CRM-specific API configuration (keys, endpoints, etc.)';
COMMENT ON COLUMN tenants.crm_user_id IS 'Tenant''s user ID in their CRM system';
COMMENT ON COLUMN tenants.last_sync_at IS 'Last successful sync timestamp';
COMMENT ON COLUMN tenants.sync_enabled IS 'Whether automatic sync is enabled';
COMMENT ON COLUMN tenants.sync_interval_minutes IS 'How often to sync data from CRM';

COMMENT ON COLUMN leads.fub_lead_id IS 'Lead ID in Follow Up Boss CRM';
COMMENT ON COLUMN leads.lofty_lead_id IS 'Lead ID in Lofty CRM';
COMMENT ON COLUMN leads.pipedrive_lead_id IS 'Lead ID in Pipedrive CRM';

COMMENT ON TABLE sync_logs IS 'Track CRM synchronization history and status';
COMMENT ON TABLE crm_field_mappings IS 'Map CRM fields to Supabase fields for each tenant';
COMMENT ON TABLE lead_qualifications IS 'Track lead qualification status and scores';
COMMENT ON TABLE usage_metrics IS 'Track usage metrics for billing and analytics';

