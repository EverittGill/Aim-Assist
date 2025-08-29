-- Add missing tables for extraction and automation
-- Run this in Supabase SQL Editor

-- =====================================================
-- EXTRACTION LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.extraction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Extraction Details
    trigger VARCHAR(50) NOT NULL, -- 'incoming_sms', 'manual', 'auto_text', etc.
    method VARCHAR(50) NOT NULL, -- 'ai_extraction', 'rule_based', 'manual_entry'
    
    -- Extracted Data
    extracted_data JSONB NOT NULL DEFAULT '{}',
    confidence_scores JSONB DEFAULT '{}', -- Per-field confidence
    overall_confidence DECIMAL(3, 2) CHECK (overall_confidence BETWEEN 0 AND 1),
    
    -- AI Processing Details
    ai_provider VARCHAR(50), -- 'claude', 'openai', 'gemini'
    ai_model VARCHAR(100),
    prompt_template VARCHAR(255),
    token_usage JSONB DEFAULT '{}',
    processing_time_ms INTEGER,
    
    -- Status & Actions
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'needs_review'
    crm_updated BOOLEAN DEFAULT false,
    crm_update_fields JSONB DEFAULT '[]',
    manual_review_needed BOOLEAN DEFAULT false,
    review_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    
    -- Context
    message_content TEXT, -- The actual message that triggered extraction
    conversation_context JSONB DEFAULT '[]', -- Recent messages for context
    
    -- Error Tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (status IN ('pending', 'completed', 'failed', 'needs_review'))
);

-- Create indexes for extraction_logs
CREATE INDEX idx_extraction_logs_tenant_lead ON extraction_logs (tenant_id, lead_id);
CREATE INDEX idx_extraction_logs_status ON extraction_logs (status);
CREATE INDEX idx_extraction_logs_created ON extraction_logs (created_at DESC);

-- =====================================================
-- PHONE NUMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Phone Number Details
    phone_number VARCHAR(20) NOT NULL,
    country_code VARCHAR(5) DEFAULT '+1',
    type VARCHAR(50) DEFAULT 'local', -- 'local', 'toll_free', 'short_code'
    
    -- Provider Details
    provider VARCHAR(50) DEFAULT 'twilio', -- 'twilio', 'signalwire', etc.
    provider_sid VARCHAR(255) UNIQUE, -- Provider's ID for the number
    capabilities JSONB DEFAULT '{"sms": true, "mms": true, "voice": false}',
    
    -- Assignment
    is_primary BOOLEAN DEFAULT false,
    purpose VARCHAR(50) DEFAULT 'general', -- 'general', 'auto_text', 'campaigns'
    assigned_to_user UUID REFERENCES users(id),
    
    -- Configuration
    webhook_url TEXT,
    auto_response_enabled BOOLEAN DEFAULT false,
    auto_response_message TEXT,
    forward_to_number VARCHAR(20), -- For call forwarding
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active',
    monthly_cost DECIMAL(10, 2),
    
    -- Usage Stats (cached)
    messages_sent_today INTEGER DEFAULT 0,
    messages_sent_month INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    
    -- Timestamps
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, phone_number),
    CHECK (status IN ('active', 'suspended', 'released', 'pending'))
);

-- =====================================================
-- AUTO TEXT RULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.auto_text_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Rule Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 10, -- Lower number = higher priority
    
    -- Trigger Conditions
    trigger_type VARCHAR(50) NOT NULL, -- 'new_lead', 'tag_added', 'time_based', 'no_response'
    trigger_conditions JSONB NOT NULL DEFAULT '{}', -- Specific conditions
    
    -- Timing
    delay_minutes INTEGER DEFAULT 1, -- How long to wait before sending
    send_window_start TIME DEFAULT '09:00:00', -- Don't send before this time
    send_window_end TIME DEFAULT '20:00:00', -- Don't send after this time
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    
    -- Lead Filters
    lead_sources JSONB DEFAULT '[]', -- Which sources to target
    lead_tags JSONB DEFAULT '[]', -- Required tags
    excluded_tags JSONB DEFAULT '[]', -- Tags to exclude
    
    -- Message Configuration
    message_template TEXT NOT NULL,
    message_variations JSONB DEFAULT '[]', -- A/B testing variations
    personalization_enabled BOOLEAN DEFAULT true,
    ai_enhancement_enabled BOOLEAN DEFAULT false,
    
    -- Limits & Controls
    max_sends_per_lead INTEGER DEFAULT 1,
    max_sends_per_day INTEGER, -- Daily limit for this rule
    stop_on_response BOOLEAN DEFAULT true, -- Stop if lead responds
    
    -- Performance Tracking
    sends_count INTEGER DEFAULT 0,
    responses_count INTEGER DEFAULT 0,
    response_rate DECIMAL(5, 2) DEFAULT 0.00,
    last_triggered_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CHECK (trigger_type IN ('new_lead', 'tag_added', 'time_based', 'no_response', 'custom'))
);

-- Create indexes for auto_text_rules
CREATE INDEX idx_auto_text_rules_tenant_active ON auto_text_rules (tenant_id, is_active);
CREATE INDEX idx_auto_text_rules_trigger ON auto_text_rules (trigger_type);

-- Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_extraction_confidence ON extraction_logs(overall_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auto_text_priority ON auto_text_rules(tenant_id, is_active, priority);

-- Grant permissions for service role
GRANT ALL ON extraction_logs TO service_role;
GRANT ALL ON phone_numbers TO service_role;
GRANT ALL ON auto_text_rules TO service_role;

-- Enable RLS (but service_role bypasses it)
ALTER TABLE extraction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY tenant_isolation_extraction_logs ON extraction_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_phone_numbers ON phone_numbers
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_auto_text_rules ON auto_text_rules
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Success message
SELECT 'Missing tables created successfully!' as status;