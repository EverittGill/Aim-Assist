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