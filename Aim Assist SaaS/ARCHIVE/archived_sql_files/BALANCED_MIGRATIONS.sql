-- Migration 001: Extensions and Base Setup
-- Balanced approach: Only essential extensions and types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Simple ENUM types (only what we know we need)
CREATE TYPE subscription_plan AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE user_role AS ENUM (
  'owner',
  'admin',
  'agent'
);

CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE sender_type AS ENUM (
  'lead',
  'ai',
  'agent',
  'system'
);

-- Helper function for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper function for phone normalization
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-numeric characters
  cleaned := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- Handle US numbers
  IF length(cleaned) = 10 THEN
    cleaned := '1' || cleaned;
  END IF;
  
  IF length(cleaned) = 11 AND substring(cleaned, 1, 1) = '1' THEN
    RETURN '+' || cleaned;
  END IF;
  
  -- Return original if can't normalize
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_phone IS 'Normalize phone numbers to E.164 format';-- Migration 002: Organizations and Agents
-- Simplified design with single AI phone per org

-- Organizations table
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  
  -- Single AI phone (simple approach)
  ai_phone_number VARCHAR(20),
  twilio_subaccount_sid VARCHAR(100),
  
  -- Billing
  stripe_customer_id VARCHAR(255) UNIQUE,
  subscription_plan subscription_plan DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Settings (flexible for unknown features)
  settings JSONB DEFAULT '{
    "timezone": "America/New_York",
    "ai_provider": "claude",
    "ai_temperature": 0.7,
    "max_tokens": 1000,
    "sms_limit_monthly": 1000,
    "lead_limit_monthly": 500
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$'),
  CONSTRAINT phone_format CHECK (
    ai_phone_number IS NULL OR 
    ai_phone_number ~ '^\+?[1-9]\d{1,14}$'
  )
);

-- Agents table (simplified)
CREATE TABLE agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID, -- Supabase auth user (no foreign key to avoid issues)
  
  -- Agent info
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  
  -- Notification phone (for qualified lead alerts)
  notification_phone VARCHAR(20),
  
  -- Access control
  role user_role DEFAULT 'agent',
  is_active BOOLEAN DEFAULT true,
  
  -- Flexible permissions
  permissions JSONB DEFAULT '{
    "can_manage_leads": true,
    "can_send_messages": true,
    "can_manage_billing": false,
    "can_manage_agents": false
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_email_per_org UNIQUE(organization_id, email),
  CONSTRAINT notification_phone_format CHECK (
    notification_phone IS NULL OR 
    notification_phone ~ '^\+?[1-9]\d{1,14}$'
  )
);

-- Indexes
CREATE INDEX idx_organizations_subdomain ON organizations(subdomain) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_active ON organizations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_org ON agents(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_user ON agents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_agents_active ON agents(organization_id, is_active) WHERE deleted_at IS NULL;

-- Triggers
CREATE TRIGGER update_organizations_updated_at 
  BEFORE UPDATE ON organizations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at 
  BEFORE UPDATE ON agents 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to get agent's organization
CREATE OR REPLACE FUNCTION get_agent_organization(p_user_id UUID)
RETURNS UUID AS $$
  SELECT organization_id 
  FROM agents 
  WHERE user_id = p_user_id 
  AND is_active = true 
  AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Comments
COMMENT ON TABLE organizations IS 'Multi-tenant organizations with single AI phone';
COMMENT ON TABLE agents IS 'Users within organizations with notification settings';
COMMENT ON COLUMN organizations.ai_phone_number IS 'Single AI phone for all conversations';
COMMENT ON COLUMN agents.notification_phone IS 'Where to send qualified lead alerts';-- Migration 003: Leads with Separate Phone Table
-- Optimized for fast phone lookups and CRM flexibility

-- Leads table (simplified with direct CRM IDs)
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  
  -- Direct CRM IDs (we know these, no need for JSONB)
  fub_lead_id VARCHAR(100),
  lofty_lead_id VARCHAR(100),
  
  -- Core fields
  source VARCHAR(100),
  stage VARCHAR(50),
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- AI status
  ai_enabled BOOLEAN DEFAULT true,
  ai_paused_until TIMESTAMPTZ,
  ai_pause_reason TEXT,
  
  -- Activity tracking
  message_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  
  -- Extension point for unknown data
  custom_data JSONB DEFAULT '{}'::jsonb,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints for CRM IDs (unique per org)
  CONSTRAINT unique_fub_lead UNIQUE(organization_id, fub_lead_id),
  CONSTRAINT unique_lofty_lead UNIQUE(organization_id, lofty_lead_id)
);

-- Separate phone table for proper indexing
CREATE TABLE lead_phones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Phone data
  phone VARCHAR(20) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL, -- Always E.164 for searching
  is_primary BOOLEAN DEFAULT false,
  phone_type VARCHAR(20) DEFAULT 'mobile', -- mobile, home, work
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate phones per org
  CONSTRAINT unique_phone_per_org UNIQUE(organization_id, phone_normalized)
);

-- Critical indexes for performance
CREATE INDEX idx_leads_org ON leads(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_fub_id ON leads(organization_id, fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX idx_leads_lofty_id ON leads(organization_id, lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;
CREATE INDEX idx_leads_email ON leads(organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_activity ON leads(organization_id, last_activity_at DESC) WHERE deleted_at IS NULL;

-- Phone lookup indexes (CRITICAL for performance)
CREATE INDEX idx_lead_phones_normalized ON lead_phones(organization_id, phone_normalized);
CREATE INDEX idx_lead_phones_lead ON lead_phones(lead_id);

-- Function to find lead by phone (uses normalized index)
CREATE OR REPLACE FUNCTION find_lead_by_phone(
  p_org_id UUID,
  p_phone TEXT
) RETURNS TABLE (
  lead_id UUID,
  lead_name TEXT,
  ai_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id as lead_id,
    CONCAT(l.first_name, ' ', l.last_name) as lead_name,
    l.ai_enabled
  FROM lead_phones lp
  JOIN leads l ON l.id = lp.lead_id
  WHERE lp.organization_id = p_org_id
  AND lp.phone_normalized = normalize_phone(p_phone)
  AND l.deleted_at IS NULL
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to add phone to lead
CREATE OR REPLACE FUNCTION add_lead_phone(
  p_lead_id UUID,
  p_phone TEXT,
  p_is_primary BOOLEAN DEFAULT false
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  v_normalized TEXT;
BEGIN
  -- Get organization
  SELECT organization_id INTO v_org_id
  FROM leads WHERE id = p_lead_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Normalize phone
  v_normalized := normalize_phone(p_phone);
  
  -- Insert or update
  INSERT INTO lead_phones (lead_id, organization_id, phone, phone_normalized, is_primary)
  VALUES (p_lead_id, v_org_id, p_phone, v_normalized, p_is_primary)
  ON CONFLICT (organization_id, phone_normalized) 
  DO UPDATE SET is_primary = EXCLUDED.is_primary;
  
  -- If setting as primary, unset others
  IF p_is_primary THEN
    UPDATE lead_phones 
    SET is_primary = false 
    WHERE lead_id = p_lead_id 
    AND phone_normalized != v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at 
  BEFORE UPDATE ON leads 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE leads IS 'Lead records with direct CRM ID storage';
COMMENT ON TABLE lead_phones IS 'Separate phone storage for fast lookups';
COMMENT ON COLUMN lead_phones.phone_normalized IS 'E.164 format for consistent searching';
COMMENT ON FUNCTION find_lead_by_phone IS 'Fast phone lookup using normalized index';-- Migration 004: Conversations and Messages
-- Simple design, no partitioning (add later if needed)

-- Conversations table
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, paused, completed
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Metrics (denormalized for performance)
  message_count INTEGER DEFAULT 0,
  ai_message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  
  -- One active conversation per lead
);

-- Partial unique index for active conversations
CREATE UNIQUE INDEX unique_active_conversation ON conversations(lead_id, status) WHERE status = 'active';

-- Messages table (simple, no partitioning yet)
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links (denormalized for query performance)
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message details
  direction message_direction NOT NULL,
  sender_type sender_type NOT NULL,
  sender_id UUID, -- agent_id if agent sent it
  
  -- Content
  content TEXT NOT NULL,
  
  -- Provider info
  provider VARCHAR(20), -- twilio, telnyx
  provider_message_id VARCHAR(255), -- Twilio SID
  provider_status VARCHAR(50), -- sent, delivered, failed
  
  -- Metadata (flexible storage)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_active ON conversations(organization_id, status) WHERE status = 'active';

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org ON messages(organization_id, created_at DESC);
CREATE INDEX idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX idx_messages_provider_id ON messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Function to get or create conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_lead_id UUID
) RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  -- Get organization from lead
  SELECT organization_id INTO v_org_id
  FROM leads WHERE id = p_lead_id;
  
  -- Find existing active conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE lead_id = p_lead_id
  AND status = 'active';
  
  IF v_conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO conversations (organization_id, lead_id)
    VALUES (v_org_id, p_lead_id)
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to insert message and update metrics
CREATE OR REPLACE FUNCTION insert_message(
  p_conversation_id UUID,
  p_direction message_direction,
  p_sender_type sender_type,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_org_id UUID;
  v_lead_id UUID;
BEGIN
  -- Get org and lead from conversation
  SELECT organization_id, lead_id 
  INTO v_org_id, v_lead_id
  FROM conversations 
  WHERE id = p_conversation_id;
  
  -- Insert message
  INSERT INTO messages (
    conversation_id,
    organization_id,
    lead_id,
    direction,
    sender_type,
    content,
    metadata
  ) VALUES (
    p_conversation_id,
    v_org_id,
    v_lead_id,
    p_direction,
    p_sender_type,
    p_content,
    p_metadata
  ) RETURNING id INTO v_message_id;
  
  -- Update conversation metrics
  UPDATE conversations
  SET 
    message_count = message_count + 1,
    ai_message_count = CASE 
      WHEN p_sender_type = 'ai' THEN ai_message_count + 1 
      ELSE ai_message_count 
    END,
    agent_message_count = CASE 
      WHEN p_sender_type = 'agent' THEN agent_message_count + 1 
      ELSE agent_message_count 
    END,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = p_conversation_id;
  
  -- Update lead activity
  UPDATE leads
  SET 
    message_count = message_count + 1,
    last_activity_at = NOW(),
    last_inbound_at = CASE 
      WHEN p_direction = 'inbound' THEN NOW() 
      ELSE last_inbound_at 
    END,
    last_outbound_at = CASE 
      WHEN p_direction = 'outbound' THEN NOW() 
      ELSE last_outbound_at 
    END,
    updated_at = NOW()
  WHERE id = v_lead_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent messages
CREATE OR REPLACE FUNCTION get_recent_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  message_id UUID,
  direction message_direction,
  sender_type sender_type,
  content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id as message_id,
    messages.direction,
    messages.sender_type,
    messages.content,
    messages.created_at
  FROM messages
  WHERE conversation_id = p_conversation_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE conversations IS 'Conversation threads (simple design, no partitioning)';
COMMENT ON TABLE messages IS 'Messages (will partition later if needed)';
COMMENT ON FUNCTION get_or_create_conversation IS 'Get existing or create new conversation';
COMMENT ON FUNCTION insert_message IS 'Insert message with automatic metric updates';-- Migration 005: AI Prompts and Lead Qualification
-- Flexible prompt system and single-source qualification tracking

-- AI Prompts table (for customizable prompts per org)
CREATE TABLE ai_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Prompt details
  name VARCHAR(100) NOT NULL,
  prompt_type VARCHAR(50) NOT NULL, -- initial, reply, follow_up, reengagement
  
  -- The actual prompts
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  
  -- Variables this prompt uses
  variables TEXT[] DEFAULT '{}',
  
  -- Model configuration
  model_config JSONB DEFAULT '{
    "temperature": 0.7,
    "max_tokens": 1000,
    "model": "claude-3-haiku"
  }'::jsonb,
  
  -- Status and usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Performance tracking
  metrics JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One default per type per org
  CONSTRAINT unique_prompt_name UNIQUE(organization_id, name)
);

-- Partial unique index for default prompts
CREATE UNIQUE INDEX unique_default_prompt ON ai_prompts(organization_id, prompt_type, is_default) WHERE is_default = true;

-- Lead Qualification (single source of truth)
CREATE TABLE lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- One qualification per lead
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  
  -- Key qualification data
  timeline_to_move TEXT,
  working_with_agent BOOLEAN,
  financing_status TEXT, -- pre_approved, cash, need_financing
  budget_range TEXT,
  
  -- Property preferences
  property_type TEXT,
  desired_location TEXT,
  must_haves TEXT[],
  
  -- Scoring
  qualification_score INTEGER DEFAULT 0, -- 0-100
  is_qualified BOOLEAN DEFAULT false,
  qualification_reason TEXT,
  qualified_at TIMESTAMPTZ,
  
  -- Interest indicators
  wants_phone_call BOOLEAN DEFAULT false,
  wants_showing BOOLEAN DEFAULT false,
  urgency_level VARCHAR(20), -- high, medium, low
  
  -- Additional data
  data JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Prompt History (for tracking what was sent)
CREATE TABLE ai_prompt_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  
  -- What was sent
  actual_prompt TEXT NOT NULL,
  variables_used JSONB,
  
  -- AI response details
  model_used VARCHAR(100),
  tokens_used INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_prompts_org ON ai_prompts(organization_id);
CREATE INDEX idx_ai_prompts_type ON ai_prompts(organization_id, prompt_type, is_active);
CREATE INDEX idx_lead_qualifications_lead ON lead_qualifications(lead_id);
CREATE INDEX idx_lead_qualifications_qualified ON lead_qualifications(is_qualified) WHERE is_qualified = true;
CREATE INDEX idx_ai_prompt_history_org ON ai_prompt_history(organization_id, created_at DESC);

-- Function to get default prompt for type
CREATE OR REPLACE FUNCTION get_default_prompt(
  p_org_id UUID,
  p_prompt_type VARCHAR(50)
) RETURNS ai_prompts AS $$
DECLARE
  v_prompt ai_prompts;
BEGIN
  SELECT * INTO v_prompt
  FROM ai_prompts
  WHERE organization_id = p_org_id
  AND prompt_type = p_prompt_type
  AND is_active = true
  AND is_default = true
  LIMIT 1;
  
  -- If no default, get any active prompt of that type
  IF v_prompt IS NULL THEN
    SELECT * INTO v_prompt
    FROM ai_prompts
    WHERE organization_id = p_org_id
    AND prompt_type = p_prompt_type
    AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN v_prompt;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate qualification score
CREATE OR REPLACE FUNCTION calculate_qualification_score(
  p_lead_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_qual RECORD;
BEGIN
  SELECT * INTO v_qual
  FROM lead_qualifications
  WHERE lead_id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Score based on key factors
  IF v_qual.timeline_to_move IS NOT NULL THEN
    v_score := v_score + 20;
    IF v_qual.timeline_to_move ILIKE '%month%' OR 
       v_qual.timeline_to_move ILIKE '%soon%' OR
       v_qual.timeline_to_move ILIKE '%asap%' THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  IF v_qual.working_with_agent = false THEN
    v_score := v_score + 25;
  ELSIF v_qual.working_with_agent IS NOT NULL THEN
    v_score := v_score + 5;
  END IF;
  
  IF v_qual.financing_status IN ('pre_approved', 'cash') THEN
    v_score := v_score + 25;
  ELSIF v_qual.financing_status IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;
  
  IF v_qual.budget_range IS NOT NULL THEN
    v_score := v_score + 15;
  END IF;
  
  IF v_qual.wants_phone_call OR v_qual.wants_showing THEN
    v_score := v_score + 15;
  END IF;
  
  -- Update the score
  UPDATE lead_qualifications
  SET 
    qualification_score = v_score,
    is_qualified = v_score >= 60,
    qualification_reason = CASE
      WHEN v_qual.wants_phone_call THEN 'Requested phone call'
      WHEN v_qual.wants_showing THEN 'Wants to see property'
      WHEN v_score >= 80 THEN 'Highly qualified'
      WHEN v_score >= 60 THEN 'Qualified'
      WHEN v_score >= 40 THEN 'Partially qualified'
      ELSE 'Needs nurturing'
    END,
    qualified_at = CASE 
      WHEN v_score >= 60 AND qualified_at IS NULL THEN NOW()
      ELSE qualified_at
    END,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_ai_prompts_updated_at 
  BEFORE UPDATE ON ai_prompts 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_qualifications_updated_at 
  BEFORE UPDATE ON lead_qualifications 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE ai_prompts IS 'Customizable AI prompts per organization';
COMMENT ON TABLE lead_qualifications IS 'Single source of truth for lead qualification';
COMMENT ON TABLE ai_prompt_history IS 'Track what prompts were used for each message';
COMMENT ON FUNCTION calculate_qualification_score IS 'Calculate lead score based on qualification data';-- Migration 006: Auto-text Rules and Usage Tracking
-- Auto-text automation and append-only usage tracking

-- Auto-text rules table
CREATE TABLE auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Rule details
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher number = higher priority
  
  -- Trigger conditions (flexible JSON)
  trigger_conditions JSONB NOT NULL,
  -- Examples:
  -- {"source": ["Zillow", "Realtor.com"], "tags": ["hot", "buyer"]}
  -- {"hours_since_created": {"max": 1}, "no_conversation": true}
  -- {"message_count": {"equals": 0}, "business_hours": true}
  
  -- Action to take
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  delay_minutes INTEGER DEFAULT 5,
  
  -- Time restrictions
  active_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "21:00"},
    "tuesday": {"start": "09:00", "end": "21:00"},
    "wednesday": {"start": "09:00", "end": "21:00"},
    "thursday": {"start": "09:00", "end": "21:00"},
    "friday": {"start": "09:00", "end": "21:00"},
    "saturday": {"start": "10:00", "end": "18:00"},
    "sunday": {"start": "10:00", "end": "18:00"}
  }'::jsonb,
  respect_timezone BOOLEAN DEFAULT true,
  
  -- Metrics
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage events table (append-only for performance)
CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- sms_sent, sms_received, lead_created, ai_response, etc.
  quantity INTEGER DEFAULT 1,
  
  -- Related entities (optional)
  lead_id UUID,
  conversation_id UUID,
  message_id UUID,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp (critical for billing periods)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage summary materialized view (refresh hourly)
CREATE MATERIALIZED VIEW usage_summary AS
SELECT 
  organization_id,
  date_trunc('month', created_at) as month,
  event_type,
  SUM(quantity) as total_quantity,
  COUNT(*) as event_count
FROM usage_events
GROUP BY organization_id, date_trunc('month', created_at), event_type;

-- Indexes
CREATE INDEX idx_auto_text_rules_org ON auto_text_rules(organization_id, is_active);
CREATE INDEX idx_auto_text_rules_priority ON auto_text_rules(priority DESC) WHERE is_active = true;

-- Critical index for usage queries
CREATE INDEX idx_usage_events_org_month ON usage_events(organization_id, created_at DESC);
CREATE INDEX idx_usage_events_type ON usage_events(organization_id, event_type, created_at DESC);

-- Index for materialized view
CREATE UNIQUE INDEX idx_usage_summary_unique ON usage_summary(organization_id, month, event_type);

-- Function to check if rule matches lead
CREATE OR REPLACE FUNCTION check_autotext_rule_match(
  p_rule_id UUID,
  p_lead_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rule RECORD;
  v_lead RECORD;
  v_conditions JSONB;
BEGIN
  -- Get rule
  SELECT * INTO v_rule
  FROM auto_text_rules
  WHERE id = p_rule_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get lead
  SELECT 
    l.*,
    COUNT(m.id) as message_count,
    EXTRACT(EPOCH FROM (NOW() - l.created_at))/3600 as hours_since_created
  INTO v_lead
  FROM leads l
  LEFT JOIN conversations c ON c.lead_id = l.id AND c.status = 'active'
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE l.id = p_lead_id
  GROUP BY l.id;
  
  v_conditions := v_rule.trigger_conditions;
  
  -- Check source condition
  IF v_conditions ? 'source' THEN
    IF NOT (v_lead.source = ANY(SELECT jsonb_array_elements_text(v_conditions->'source'))) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check tags condition
  IF v_conditions ? 'tags' THEN
    IF NOT (v_lead.tags && (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(v_conditions->'tags') elem)) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check message count
  IF v_conditions ? 'message_count' THEN
    IF v_conditions->'message_count' ? 'equals' THEN
      IF v_lead.message_count != (v_conditions->'message_count'->>'equals')::INTEGER THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  -- Check hours since created
  IF v_conditions->'hours_since_created' ? 'max' THEN
    IF v_lead.hours_since_created > (v_conditions->'hours_since_created'->>'max')::FLOAT THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to record usage event
CREATE OR REPLACE FUNCTION record_usage(
  p_org_id UUID,
  p_event_type VARCHAR(50),
  p_quantity INTEGER DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_events (organization_id, event_type, quantity, metadata)
  VALUES (p_org_id, p_event_type, p_quantity, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly usage
CREATE OR REPLACE FUNCTION get_monthly_usage(
  p_org_id UUID,
  p_month DATE DEFAULT date_trunc('month', CURRENT_DATE)
) RETURNS TABLE (
  event_type VARCHAR(50),
  total_quantity BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ue.event_type,
    SUM(ue.quantity)::BIGINT as total_quantity
  FROM usage_events ue
  WHERE ue.organization_id = p_org_id
  AND ue.created_at >= p_month
  AND ue.created_at < p_month + INTERVAL '1 month'
  GROUP BY ue.event_type;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_org_id UUID,
  p_event_type VARCHAR(50),
  p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_settings JSONB;
  v_current_usage BIGINT;
  v_limit INTEGER;
  v_limit_key TEXT;
BEGIN
  -- Get org settings
  SELECT settings INTO v_settings
  FROM organizations
  WHERE id = p_org_id;
  
  -- Map event type to limit key
  v_limit_key := CASE p_event_type
    WHEN 'sms_sent' THEN 'sms_limit_monthly'
    WHEN 'lead_created' THEN 'lead_limit_monthly'
    ELSE NULL
  END;
  
  IF v_limit_key IS NULL THEN
    RETURN true; -- No limit for this event type
  END IF;
  
  -- Get limit from settings
  v_limit := COALESCE((v_settings->>v_limit_key)::INTEGER, 999999);
  
  -- Get current usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_usage
  FROM usage_events
  WHERE organization_id = p_org_id
  AND event_type = p_event_type
  AND created_at >= date_trunc('month', CURRENT_DATE);
  
  -- Check if increment would exceed limit
  RETURN (v_current_usage + p_increment) <= v_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for auto-text rules
CREATE TRIGGER update_auto_text_rules_updated_at 
  BEFORE UPDATE ON auto_text_rules 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE auto_text_rules IS 'Automated text message rules based on triggers';
COMMENT ON TABLE usage_events IS 'Append-only usage tracking for billing';
COMMENT ON MATERIALIZED VIEW usage_summary IS 'Pre-aggregated usage data (refresh hourly)';
COMMENT ON FUNCTION check_autotext_rule_match IS 'Check if a rule matches a lead';
COMMENT ON FUNCTION record_usage IS 'Record a usage event (append-only)';
COMMENT ON FUNCTION check_usage_limit IS 'Check if action would exceed monthly limit';-- Migration 007: CRM Configuration
-- Simple CRM config with field mappings in JSON

-- CRM configurations table
CREATE TABLE crm_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- CRM type and status
  crm_type VARCHAR(20) NOT NULL, -- fub, lofty, kvcore, etc.
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT true,
  
  -- Encrypted credentials
  credentials_encrypted TEXT NOT NULL,
  
  -- Non-sensitive config
  config JSONB DEFAULT '{}'::jsonb,
  -- For FUB: {"x_system": "...", "x_system_key": "...", "user_id": "..."}
  -- For Lofty: {"team_id": "...", "api_version": "v2"}
  
  -- Field mappings (simple JSON, not separate table)
  field_mappings JSONB DEFAULT '{}'::jsonb,
  -- Example:
  -- {
  --   "first_name": "firstName",
  --   "last_name": "lastName",
  --   "phone": "phones[0].value",
  --   "email": "emails[0].value",
  --   "custom_ai_status": "customEugeniaTalkingStatus"
  -- }
  
  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  sync_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_crm_per_org UNIQUE(organization_id, crm_type)
);

-- Partial unique index for primary CRM
CREATE UNIQUE INDEX one_primary_crm ON crm_configs(organization_id, is_primary) WHERE is_primary = true;

-- Webhook logs table
CREATE TABLE webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Source
  source VARCHAR(50), -- fub, lofty, twilio, stripe
  event_type VARCHAR(100),
  
  -- Request data
  headers JSONB,
  payload JSONB,
  
  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default field mappings (for reference/initialization)
CREATE TABLE crm_field_defaults (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  crm_type VARCHAR(20) NOT NULL,
  field_mappings JSONB NOT NULL,
  
  CONSTRAINT unique_crm_defaults UNIQUE(crm_type)
);

-- Insert default mappings
INSERT INTO crm_field_defaults (crm_type, field_mappings) VALUES
('fub', '{
  "first_name": "firstName",
  "last_name": "lastName",
  "email": "emails[0].value",
  "phone": "phones[0].value",
  "source": "source",
  "tags": "tags",
  "external_id": "id",
  "custom_ai_status": "customEugeniaTalkingStatus",
  "custom_ai_link": "customAimAssist",
  "custom_ai_paused": "customEugeniaPausedUntil"
}'::jsonb),
('lofty', '{
  "first_name": "contact.first_name",
  "last_name": "contact.last_name",
  "email": "contact.email",
  "phone": "contact.phone_number",
  "source": "lead_source",
  "tags": "tags",
  "external_id": "id"
}'::jsonb);

-- Indexes
CREATE INDEX idx_crm_configs_org ON crm_configs(organization_id, is_active);
CREATE INDEX idx_webhook_logs_org ON webhook_logs(organization_id, created_at DESC);
CREATE INDEX idx_webhook_logs_unprocessed ON webhook_logs(processed, created_at) WHERE processed = false;

-- Function to get CRM field value
CREATE OR REPLACE FUNCTION get_crm_field_value(
  p_crm_data JSONB,
  p_field_path TEXT
) RETURNS TEXT AS $$
DECLARE
  v_parts TEXT[];
  v_current JSONB;
  v_part TEXT;
  v_index INTEGER;
BEGIN
  -- Handle simple field names
  IF p_field_path NOT LIKE '%.%' AND p_field_path NOT LIKE '%[%' THEN
    RETURN p_crm_data->>p_field_path;
  END IF;
  
  -- Split path by dots
  v_parts := string_to_array(p_field_path, '.');
  v_current := p_crm_data;
  
  FOREACH v_part IN ARRAY v_parts LOOP
    -- Check for array notation like "phones[0]"
    IF v_part LIKE '%[%]' THEN
      -- Extract field name and index
      v_part := substring(v_part from '^[^[]+');
      v_index := substring(p_field_path from '\[(\d+)\]')::INTEGER;
      
      -- Navigate to array element
      v_current := v_current->v_part->v_index;
    ELSE
      -- Simple field navigation
      v_current := v_current->v_part;
    END IF;
    
    IF v_current IS NULL THEN
      RETURN NULL;
    END IF;
  END LOOP;
  
  -- Return as text
  IF jsonb_typeof(v_current) = 'string' THEN
    RETURN v_current #>> '{}';
  ELSE
    RETURN v_current::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to map CRM data to our schema
CREATE OR REPLACE FUNCTION map_crm_to_lead(
  p_org_id UUID,
  p_crm_type VARCHAR(20),
  p_crm_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_mappings JSONB;
  v_result JSONB := '{}'::jsonb;
  v_field RECORD;
BEGIN
  -- Get field mappings for this CRM
  SELECT field_mappings INTO v_mappings
  FROM crm_configs
  WHERE organization_id = p_org_id
  AND crm_type = p_crm_type
  AND is_active = true
  LIMIT 1;
  
  -- If no custom mappings, use defaults
  IF v_mappings IS NULL THEN
    SELECT field_mappings INTO v_mappings
    FROM crm_field_defaults
    WHERE crm_type = p_crm_type;
  END IF;
  
  -- Map each field
  FOR v_field IN SELECT * FROM jsonb_each_text(v_mappings) LOOP
    v_result := jsonb_set(
      v_result,
      ARRAY[v_field.key],
      to_jsonb(get_crm_field_value(p_crm_data, v_field.value))
    );
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for updated_at
CREATE TRIGGER update_crm_configs_updated_at 
  BEFORE UPDATE ON crm_configs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE crm_configs IS 'CRM integration configurations';
COMMENT ON TABLE webhook_logs IS 'Incoming webhook log for debugging';
COMMENT ON TABLE crm_field_defaults IS 'Default field mappings for each CRM type';
COMMENT ON FUNCTION get_crm_field_value IS 'Extract value from CRM data using path notation';
COMMENT ON FUNCTION map_crm_to_lead IS 'Map CRM data to our lead schema';-- Migration 008: Row Level Security and Final Setup
-- Complete RLS policies and helper functions

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS
CREATE OR REPLACE FUNCTION get_user_organization()
RETURNS UUID AS $$
  SELECT organization_id 
  FROM agents 
  WHERE user_id = auth.uid() 
  AND is_active = true 
  AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (id = get_user_organization());

CREATE POLICY "Owners can update organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Agents policies
CREATE POLICY "Users can view agents in their org" ON agents
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can update their own agent record" ON agents
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage agents" ON agents
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND organization_id = agents.organization_id
    )
  );

-- Leads policies
CREATE POLICY "Users can view leads in their org" ON leads
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage leads in their org" ON leads
  FOR ALL USING (organization_id = get_user_organization());

-- Lead phones policies
CREATE POLICY "Users can view phones in their org" ON lead_phones
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage phones in their org" ON lead_phones
  FOR ALL USING (organization_id = get_user_organization());

-- Conversations policies
CREATE POLICY "Users can view conversations in their org" ON conversations
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage conversations in their org" ON conversations
  FOR ALL USING (organization_id = get_user_organization());

-- Messages policies
CREATE POLICY "Users can view messages in their org" ON messages
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can create messages in their org" ON messages
  FOR INSERT WITH CHECK (organization_id = get_user_organization());

-- AI prompts policies
CREATE POLICY "Users can view prompts in their org" ON ai_prompts
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage prompts in their org" ON ai_prompts
  FOR ALL USING (organization_id = get_user_organization());

-- Lead qualifications policies
CREATE POLICY "Users can view qualifications" ON lead_qualifications
  FOR SELECT USING (
    lead_id IN (SELECT id FROM leads WHERE organization_id = get_user_organization())
  );

CREATE POLICY "Users can manage qualifications" ON lead_qualifications
  FOR ALL USING (
    lead_id IN (SELECT id FROM leads WHERE organization_id = get_user_organization())
  );

-- Auto-text rules policies
CREATE POLICY "Users can view auto-text rules" ON auto_text_rules
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Admins can manage auto-text rules" ON auto_text_rules
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Usage events policies (read-only for users)
CREATE POLICY "Users can view usage in their org" ON usage_events
  FOR SELECT USING (organization_id = get_user_organization());

-- Service role can insert usage events
CREATE POLICY "Service role can insert usage" ON usage_events
  FOR INSERT WITH CHECK (true);

-- CRM configs policies
CREATE POLICY "Users can view CRM configs" ON crm_configs
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Admins can manage CRM configs" ON crm_configs
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Webhook logs policies
CREATE POLICY "Admins can view webhook logs" ON webhook_logs
  FOR SELECT USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Service role can insert webhook logs
CREATE POLICY "Service role can insert webhook logs" ON webhook_logs
  FOR INSERT WITH CHECK (true);

-- Additional performance indexes
CREATE INDEX idx_leads_last_activity ON leads(organization_id, last_activity_at DESC) 
  WHERE deleted_at IS NULL;
  
CREATE INDEX idx_messages_created_recent ON messages(created_at DESC) 
  WHERE created_at > CURRENT_DATE - INTERVAL '7 days';

-- System health check function
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  RETURN QUERY
  
  -- Check RLS is enabled
  SELECT 
    'RLS Enabled'::TEXT,
    CASE 
      WHEN COUNT(*) = 13 THEN 'OK'::TEXT
      ELSE 'WARNING'::TEXT
    END,
    'Tables with RLS: ' || COUNT(*)::TEXT
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
  AND c.relrowsecurity = true
  AND t.tablename IN (
    'organizations', 'agents', 'leads', 'lead_phones',
    'conversations', 'messages', 'ai_prompts', 'lead_qualifications',
    'ai_prompt_history', 'auto_text_rules', 'usage_events',
    'crm_configs', 'webhook_logs'
  );
  
  UNION ALL
  
  -- Check indexes
  SELECT 
    'Indexes'::TEXT,
    'OK'::TEXT,
    'Total indexes: ' || COUNT(*)::TEXT
  FROM pg_indexes
  WHERE schemaname = 'public';
  
  UNION ALL
  
  -- Check functions
  SELECT 
    'Functions'::TEXT,
    'OK'::TEXT,
    'Helper functions: ' || COUNT(*)::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public';
END;
$$ LANGUAGE plpgsql;

-- Lead context function for AI
CREATE OR REPLACE FUNCTION get_lead_context(
  p_lead_id UUID,
  p_message_limit INTEGER DEFAULT 20
) RETURNS JSONB AS $$
DECLARE
  v_context JSONB;
  v_lead RECORD;
  v_messages JSONB;
  v_qualification RECORD;
BEGIN
  -- Get lead data
  SELECT 
    l.*,
    o.name as org_name,
    o.settings as org_settings
  INTO v_lead
  FROM leads l
  JOIN organizations o ON o.id = l.organization_id
  WHERE l.id = p_lead_id;
  
  -- Get recent messages
  SELECT jsonb_agg(
    jsonb_build_object(
      'direction', m.direction,
      'sender_type', m.sender_type,
      'content', m.content,
      'created_at', m.created_at
    ) ORDER BY m.created_at DESC
  ) INTO v_messages
  FROM (
    SELECT * FROM messages
    WHERE lead_id = p_lead_id
    ORDER BY created_at DESC
    LIMIT p_message_limit
  ) m;
  
  -- Get qualification
  SELECT * INTO v_qualification
  FROM lead_qualifications
  WHERE lead_id = p_lead_id;
  
  -- Build context
  v_context := jsonb_build_object(
    'lead', jsonb_build_object(
      'name', CONCAT(v_lead.first_name, ' ', v_lead.last_name),
      'source', v_lead.source,
      'tags', v_lead.tags,
      'custom_data', v_lead.custom_data
    ),
    'organization', jsonb_build_object(
      'name', v_lead.org_name,
      'settings', v_lead.org_settings
    ),
    'messages', COALESCE(v_messages, '[]'::jsonb),
    'qualification', CASE 
      WHEN v_qualification.id IS NOT NULL THEN
        jsonb_build_object(
          'timeline', v_qualification.timeline_to_move,
          'working_with_agent', v_qualification.working_with_agent,
          'financing', v_qualification.financing_status,
          'budget', v_qualification.budget_range,
          'score', v_qualification.qualification_score
        )
      ELSE NULL
    END
  );
  
  RETURN v_context;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Final setup
DO $$
BEGIN
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Run SELECT * FROM system_health_check() to verify setup.';
END $$;

-- Comments
COMMENT ON FUNCTION get_user_organization IS 'Get current user organization for RLS';
COMMENT ON FUNCTION system_health_check IS 'Verify database setup is complete';
COMMENT ON FUNCTION get_lead_context IS 'Get complete lead context for AI processing';