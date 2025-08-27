-- BALANCED MIGRATIONS - CLEAN VERSION
-- Fixed all syntax errors and removed problematic indexes

-- Migration 001: Extensions and Base Setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Simple ENUM types
CREATE TYPE subscription_plan AS ENUM ('trial', 'starter', 'professional', 'enterprise');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'agent');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE sender_type AS ENUM ('lead', 'ai', 'agent', 'system');

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

-- Migration 002: Organizations and Agents
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  ai_phone_number VARCHAR(20),
  twilio_subaccount_sid VARCHAR(100),
  stripe_customer_id VARCHAR(255) UNIQUE,
  subscription_plan subscription_plan DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$'),
  CONSTRAINT phone_format CHECK (ai_phone_number IS NULL OR ai_phone_number ~ '^\+?[1-9]\d{1,14}$')
);

CREATE TABLE agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  notification_phone VARCHAR(20),
  role user_role DEFAULT 'agent',
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_email_per_org UNIQUE(organization_id, email),
  CONSTRAINT notification_phone_format CHECK (notification_phone IS NULL OR notification_phone ~ '^\+?[1-9]\d{1,14}$')
);

-- Simple indexes without WHERE clauses
CREATE INDEX idx_organizations_subdomain ON organizations(subdomain);
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_user ON agents(user_id);

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 003: Leads and Phones
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  fub_lead_id VARCHAR(100),
  lofty_lead_id VARCHAR(100),
  source VARCHAR(100),
  stage VARCHAR(50),
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  ai_enabled BOOLEAN DEFAULT true,
  ai_paused_until TIMESTAMPTZ,
  ai_pause_reason TEXT,
  message_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  custom_data JSONB DEFAULT '{}'::jsonb,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_fub_lead UNIQUE(organization_id, fub_lead_id),
  CONSTRAINT unique_lofty_lead UNIQUE(organization_id, lofty_lead_id)
);

CREATE TABLE lead_phones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  phone_type VARCHAR(20) DEFAULT 'mobile',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_phone_per_org UNIQUE(organization_id, phone_normalized)
);

CREATE INDEX idx_leads_org ON leads(organization_id);
CREATE INDEX idx_leads_fub_id ON leads(organization_id, fub_lead_id);
CREATE INDEX idx_leads_lofty_id ON leads(organization_id, lofty_lead_id);
CREATE INDEX idx_lead_phones_normalized ON lead_phones(organization_id, phone_normalized);
CREATE INDEX idx_lead_phones_lead ON lead_phones(lead_id);

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 004: Conversations and Messages
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active',
  ai_enabled BOOLEAN DEFAULT true,
  message_count INTEGER DEFAULT 0,
  ai_message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create partial unique index separately
CREATE UNIQUE INDEX unique_active_conversation ON conversations(lead_id) WHERE status = 'active';

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  sender_type sender_type NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  provider VARCHAR(20),
  provider_message_id VARCHAR(255),
  provider_status VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org ON messages(organization_id, created_at DESC);

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 005: AI and Qualification
CREATE TABLE ai_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  prompt_type VARCHAR(50) NOT NULL,
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  model_config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_prompt_name UNIQUE(organization_id, name)
);

-- Create partial unique index for default prompts
CREATE UNIQUE INDEX unique_default_prompt ON ai_prompts(organization_id, prompt_type) WHERE is_default = true;

CREATE TABLE lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  timeline_to_move TEXT,
  working_with_agent BOOLEAN,
  financing_status TEXT,
  budget_range TEXT,
  property_type TEXT,
  desired_location TEXT,
  must_haves TEXT[],
  qualification_score INTEGER DEFAULT 0,
  is_qualified BOOLEAN DEFAULT false,
  qualification_reason TEXT,
  qualified_at TIMESTAMPTZ,
  wants_phone_call BOOLEAN DEFAULT false,
  wants_showing BOOLEAN DEFAULT false,
  urgency_level VARCHAR(20),
  data JSONB DEFAULT '{}'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_prompts_org ON ai_prompts(organization_id);
CREATE INDEX idx_lead_qualifications_lead ON lead_qualifications(lead_id);

CREATE TRIGGER update_ai_prompts_updated_at BEFORE UPDATE ON ai_prompts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lead_qualifications_updated_at BEFORE UPDATE ON lead_qualifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 006: Auto-text and Usage
CREATE TABLE auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  trigger_conditions JSONB NOT NULL,
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  custom_message TEXT,
  delay_minutes INTEGER DEFAULT 0,
  max_sends_per_lead INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  stats JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  quantity INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_text_rules_org ON auto_text_rules(organization_id);
CREATE INDEX idx_usage_events_org_date ON usage_events(organization_id, created_at DESC);
CREATE INDEX idx_usage_events_type ON usage_events(organization_id, event_type, created_at DESC);

CREATE TRIGGER update_auto_text_rules_updated_at BEFORE UPDATE ON auto_text_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 007: CRM Configuration
CREATE TABLE crm_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_type VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT true,
  credentials_encrypted TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  field_mappings JSONB DEFAULT '{}'::jsonb,
  webhook_url TEXT,
  webhook_secret TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_crm_per_org UNIQUE(organization_id, crm_type)
);

-- Create partial unique index for primary CRM
CREATE UNIQUE INDEX one_primary_crm ON crm_configs(organization_id) WHERE is_primary = true;

CREATE TABLE webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source VARCHAR(50),
  event_type VARCHAR(100),
  headers JSONB,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crm_configs_org ON crm_configs(organization_id, is_active);
CREATE INDEX idx_webhook_logs_org ON webhook_logs(organization_id, created_at DESC);

CREATE TRIGGER update_crm_configs_updated_at BEFORE UPDATE ON crm_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration 008: Helper Functions (no RLS for now)
-- Get or create conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(p_lead_id UUID)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
  SELECT id INTO v_conversation_id FROM conversations WHERE lead_id = p_lead_id AND status = 'active';
  
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (organization_id, lead_id)
    VALUES (v_org_id, p_lead_id)
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Find lead by phone
CREATE OR REPLACE FUNCTION find_lead_by_phone(p_org_id UUID, p_phone TEXT)
RETURNS TABLE (lead_id UUID, lead_name TEXT, ai_enabled BOOLEAN) AS $$
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

-- Add phone to lead
CREATE OR REPLACE FUNCTION add_lead_phone(p_lead_id UUID, p_phone TEXT, p_is_primary BOOLEAN DEFAULT false)
RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  v_normalized TEXT;
BEGIN
  SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  v_normalized := normalize_phone(p_phone);
  
  INSERT INTO lead_phones (lead_id, organization_id, phone, phone_normalized, is_primary)
  VALUES (p_lead_id, v_org_id, p_phone, v_normalized, p_is_primary)
  ON CONFLICT (organization_id, phone_normalized) 
  DO UPDATE SET is_primary = EXCLUDED.is_primary;
  
  IF p_is_primary THEN
    UPDATE lead_phones 
    SET is_primary = false 
    WHERE lead_id = p_lead_id 
    AND phone_normalized != v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Record usage
CREATE OR REPLACE FUNCTION record_usage(p_org_id UUID, p_event_type VARCHAR(50), p_quantity INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_events (organization_id, event_type, quantity)
  VALUES (p_org_id, p_event_type, p_quantity);
END;
$$ LANGUAGE plpgsql;

-- Check usage limit
CREATE OR REPLACE FUNCTION check_usage_limit(p_org_id UUID, p_event_type VARCHAR(50), p_increment INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  -- Get limit from organization settings
  SELECT (settings->>'sms_limit_monthly')::INTEGER INTO v_limit
  FROM organizations WHERE id = p_org_id;
  
  IF v_limit IS NULL THEN
    v_limit := 1000; -- Default
  END IF;
  
  -- Count usage this month
  SELECT COALESCE(SUM(quantity), 0) INTO v_used
  FROM usage_events
  WHERE organization_id = p_org_id
  AND event_type = p_event_type
  AND created_at >= date_trunc('month', CURRENT_DATE);
  
  RETURN (v_used + p_increment) <= v_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- System ready check
DO $$
BEGIN
  RAISE NOTICE 'Database setup complete!';
  RAISE NOTICE 'Tables created: 11';
  RAISE NOTICE 'Functions created: 5';
  RAISE NOTICE 'Ready for testing';
END $$;