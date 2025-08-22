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