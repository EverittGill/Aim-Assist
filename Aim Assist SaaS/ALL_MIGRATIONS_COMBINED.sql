-- Migration 001: Enable Extensions and Create ENUMs
-- Purpose: Set up foundational database extensions and types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite GIN indexes

-- Create ENUM types for consistent status values
CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active', 
  'past_due',
  'canceled',
  'paused'
);

CREATE TYPE subscription_plan AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise',
  'custom'
);

CREATE TYPE crm_type AS ENUM (
  'fub',           -- Follow Up Boss
  'lofty',         -- Lofty (formerly Chime)
  'pipedrive',     -- Pipedrive
  'salesforce',    -- Salesforce
  'hubspot',       -- HubSpot
  'kvcore',        -- KvCore
  'liondesk',      -- LionDesk
  'custom'         -- Custom CRM
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

CREATE TYPE conversation_status AS ENUM (
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE qualification_status AS ENUM (
  'not_qualified',
  'partially_qualified',
  'qualified',
  'disqualified'
);

CREATE TYPE ai_provider AS ENUM (
  'claude',
  'openai',
  'gemini',
  'custom'
);

-- Create a simple test to verify extensions are enabled
CREATE OR REPLACE FUNCTION test_extensions()
RETURNS TABLE (
  extension_name text,
  is_installed boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ext.extname::text,
    true as is_installed
  FROM pg_extension ext
  WHERE ext.extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin')
  ORDER BY ext.extname;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TYPE subscription_status IS 'Subscription status for tenant billing';
COMMENT ON TYPE subscription_plan IS 'Available subscription tiers';
COMMENT ON TYPE crm_type IS 'Supported CRM integrations';
COMMENT ON TYPE message_direction IS 'SMS message direction';
COMMENT ON TYPE sender_type IS 'Type of message sender';
COMMENT ON TYPE conversation_status IS 'Conversation lifecycle status';
COMMENT ON TYPE qualification_status IS 'Lead qualification status';
COMMENT ON TYPE ai_provider IS 'AI service providers for text generation';-- Migration 002: Organizations Table
-- Purpose: Multi-tenant organizations with single AI phone per tenant

CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic information
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  industry VARCHAR(100) DEFAULT 'real_estate',
  
  -- Single AI phone number per organization (simplified design)
  ai_phone_number VARCHAR(20),
  ai_phone_provider VARCHAR(20) DEFAULT 'twilio', -- twilio, telnyx, etc.
  ai_phone_sid VARCHAR(100), -- Provider-specific ID
  twilio_subaccount_sid VARCHAR(100), -- For tenant isolation in Twilio
  
  -- Subscription information
  subscription_status subscription_status DEFAULT 'trial',
  subscription_plan subscription_plan DEFAULT 'starter',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_ends_at TIMESTAMPTZ,
  
  -- Stripe integration
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
    "ai_provider": "claude",
    "ai_temperature": 0.7,
    "sms_limit_monthly": 1000,
    "lead_limit_monthly": 500,
    "max_agents": 10
  }'::jsonb,
  
  -- Usage limits (cached for quick checks)
  current_usage JSONB DEFAULT '{
    "sms_sent_this_month": 0,
    "leads_created_this_month": 0,
    "ai_tokens_this_month": 0,
    "agents_active": 0
  }'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete
  
  -- Constraints
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$'),
  CONSTRAINT phone_format CHECK (
    ai_phone_number IS NULL OR 
    ai_phone_number ~ '^\+?[1-9]\d{1,14}$'
  )
);

-- Create indexes for common queries
CREATE INDEX idx_organizations_subdomain ON organizations(subdomain) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_active ON organizations(subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_phone ON organizations(ai_phone_number) WHERE ai_phone_number IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (will be tied to auth.users in migration 003)
-- For now, create a placeholder policy
CREATE POLICY organizations_service_role ON organizations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Helper function to check organization limits
CREATE OR REPLACE FUNCTION check_organization_limit(
  org_id UUID,
  limit_type TEXT,
  increment_by INT DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  org_settings JSONB;
  org_usage JSONB;
  current_count INT;
  max_allowed INT;
BEGIN
  SELECT settings, current_usage 
  INTO org_settings, org_usage
  FROM organizations 
  WHERE id = org_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Get current usage and limit based on type
  CASE limit_type
    WHEN 'sms' THEN
      current_count := COALESCE((org_usage->>'sms_sent_this_month')::INT, 0);
      max_allowed := COALESCE((org_settings->>'sms_limit_monthly')::INT, 1000);
    WHEN 'leads' THEN
      current_count := COALESCE((org_usage->>'leads_created_this_month')::INT, 0);
      max_allowed := COALESCE((org_settings->>'lead_limit_monthly')::INT, 500);
    WHEN 'agents' THEN
      current_count := COALESCE((org_usage->>'agents_active')::INT, 0);
      max_allowed := COALESCE((org_settings->>'max_agents')::INT, 10);
    ELSE
      RETURN TRUE; -- Unknown limit type, allow by default
  END CASE;
  
  -- Check if adding increment_by would exceed limit
  RETURN (current_count + increment_by) <= max_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION increment_organization_usage(
  org_id UUID,
  usage_type TEXT,
  increment_by INT DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  UPDATE organizations
  SET 
    current_usage = 
      CASE usage_type
        WHEN 'sms' THEN 
          jsonb_set(current_usage, '{sms_sent_this_month}', 
            to_jsonb(COALESCE((current_usage->>'sms_sent_this_month')::INT, 0) + increment_by))
        WHEN 'leads' THEN
          jsonb_set(current_usage, '{leads_created_this_month}',
            to_jsonb(COALESCE((current_usage->>'leads_created_this_month')::INT, 0) + increment_by))
        WHEN 'tokens' THEN
          jsonb_set(current_usage, '{ai_tokens_this_month}',
            to_jsonb(COALESCE((current_usage->>'ai_tokens_this_month')::INT, 0) + increment_by))
        ELSE current_usage
      END,
    updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly usage (call via cron job)
CREATE OR REPLACE FUNCTION reset_monthly_usage() RETURNS VOID AS $$
BEGIN
  UPDATE organizations
  SET 
    current_usage = jsonb_set(
      jsonb_set(
        jsonb_set(
          current_usage,
          '{sms_sent_this_month}', '0'
        ),
        '{leads_created_this_month}', '0'
      ),
      '{ai_tokens_this_month}', '0'
    ),
    updated_at = NOW()
  WHERE deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at 
  BEFORE UPDATE ON organizations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant organizations with single AI phone per tenant';
COMMENT ON COLUMN organizations.ai_phone_number IS 'Single AI phone number for all AI communications';
COMMENT ON COLUMN organizations.subdomain IS 'Unique subdomain for tenant access (e.g., company.aimassist.com)';
COMMENT ON COLUMN organizations.current_usage IS 'Cached usage counters for quick limit checks';
COMMENT ON FUNCTION check_organization_limit IS 'Check if organization can perform action within limits';
COMMENT ON FUNCTION increment_organization_usage IS 'Increment usage counter for billing/limits';-- Migration 003: Agents (Users) Table
-- Purpose: Agents with notification phones, linked to Supabase auth.users

-- First, create agents table that links to auth.users
CREATE TABLE IF NOT EXISTS agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Link to Supabase auth
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Organization membership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Agent information
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  
  -- Notification phone (where to send qualified lead alerts)
  notification_phone VARCHAR(20),
  notification_preferences JSONB DEFAULT '{
    "sms_enabled": true,
    "email_enabled": true,
    "qualified_lead_alerts": true,
    "daily_summary": false,
    "escalation_alerts": true
  }'::jsonb,
  
  -- Role and permissions
  role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'manager', 'agent')),
  permissions JSONB DEFAULT '{
    "can_manage_leads": true,
    "can_send_messages": true,
    "can_view_analytics": false,
    "can_manage_agents": false,
    "can_manage_billing": false,
    "can_configure_ai": false
  }'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_user_per_org UNIQUE(user_id, organization_id),
  CONSTRAINT unique_email_per_org UNIQUE(email, organization_id),
  CONSTRAINT notification_phone_format CHECK (
    notification_phone IS NULL OR 
    notification_phone ~ '^\+?[1-9]\d{1,14}$'
  )
);

-- Create indexes
CREATE INDEX idx_agents_organization ON agents(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_user ON agents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_email ON agents(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_active ON agents(organization_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_notification_phone ON agents(notification_phone) WHERE notification_phone IS NOT NULL;

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agents
-- Agents can view other agents in their organization
CREATE POLICY agents_view_same_org ON agents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

-- Agents can update their own record
CREATE POLICY agents_update_self ON agents
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins and owners can manage agents in their org
CREATE POLICY agents_manage_by_admin ON agents
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- Update organizations RLS to use agents table
DROP POLICY IF EXISTS organizations_service_role ON organizations;

CREATE POLICY organizations_view_by_agents ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

CREATE POLICY organizations_manage_by_owner ON organizations
  FOR ALL
  USING (
    id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id 
      FROM agents 
      WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND deleted_at IS NULL
    )
  );

-- Helper function to get agent's organization
CREATE OR REPLACE FUNCTION get_agent_organization(agent_user_id UUID)
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM agents
  WHERE user_id = agent_user_id
  AND is_active = true
  AND deleted_at IS NULL
  LIMIT 1;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check agent permissions
CREATE OR REPLACE FUNCTION check_agent_permission(
  agent_user_id UUID,
  permission_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  agent_permissions JSONB;
  agent_role TEXT;
BEGIN
  SELECT permissions, role INTO agent_permissions, agent_role
  FROM agents
  WHERE user_id = agent_user_id
  AND is_active = true
  AND deleted_at IS NULL
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Owners have all permissions
  IF agent_role = 'owner' THEN
    RETURN TRUE;
  END IF;
  
  -- Check specific permission
  RETURN COALESCE((agent_permissions->>permission_name)::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all notification phones for an organization
CREATE OR REPLACE FUNCTION get_organization_notification_phones(org_id UUID)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  phone VARCHAR(20),
  preferences JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    CONCAT(a.first_name, ' ', a.last_name) as agent_name,
    a.notification_phone as phone,
    a.notification_preferences as preferences
  FROM agents a
  WHERE a.organization_id = org_id
  AND a.notification_phone IS NOT NULL
  AND a.is_active = true
  AND a.deleted_at IS NULL
  AND (a.notification_preferences->>'sms_enabled')::BOOLEAN = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update agent count in organization
CREATE OR REPLACE FUNCTION update_organization_agent_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE organizations
    SET current_usage = jsonb_set(
      current_usage,
      '{agents_active}',
      to_jsonb((
        SELECT COUNT(*)::INT
        FROM agents
        WHERE organization_id = NEW.organization_id
        AND is_active = true
        AND deleted_at IS NULL
      ))
    )
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET current_usage = jsonb_set(
      current_usage,
      '{agents_active}',
      to_jsonb((
        SELECT COUNT(*)::INT
        FROM agents
        WHERE organization_id = OLD.organization_id
        AND is_active = true
        AND deleted_at IS NULL
      ))
    )
    WHERE id = OLD.organization_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_agent_count();

-- Update trigger for updated_at
CREATE TRIGGER update_agents_updated_at 
  BEFORE UPDATE ON agents 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE agents IS 'Agents (users) with notification phones for lead alerts';
COMMENT ON COLUMN agents.notification_phone IS 'Phone number for receiving qualified lead alerts';
COMMENT ON COLUMN agents.notification_preferences IS 'Configurable notification settings per agent';
COMMENT ON COLUMN agents.role IS 'Role within organization: owner > admin > manager > agent';
COMMENT ON FUNCTION get_agent_organization IS 'Get the organization ID for an agent user';
COMMENT ON FUNCTION check_agent_permission IS 'Check if agent has specific permission';-- Migration 004: CRM Integration Layer
-- Purpose: Flexible CRM integration with field mapping

-- CRM integrations table
CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization link
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- CRM details
  crm_type crm_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT true, -- One primary CRM per org
  
  -- Encrypted credentials (use pgcrypto in production)
  -- Store different credentials based on CRM type
  credentials_encrypted TEXT, -- Will be encrypted JSON
  
  -- Unencrypted config (non-sensitive)
  config JSONB DEFAULT '{}'::jsonb,
  -- For FUB: { "x_system": "...", "x_system_key": "...", "user_id": "..." }
  -- For Lofty: { "team_id": "...", "api_version": "v2" }
  
  -- Sync configuration
  sync_config JSONB DEFAULT '{
    "sync_interval_minutes": 15,
    "sync_enabled": true,
    "sync_direction": "bidirectional",
    "auto_create_leads": true,
    "auto_update_leads": true
  }'::jsonb,
  
  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret TEXT,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  
  -- Last sync tracking
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  last_sync_error TEXT,
  sync_stats JSONB DEFAULT '{
    "leads_synced": 0,
    "messages_synced": 0,
    "errors": 0,
    "last_lead_id": null
  }'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_org_crm UNIQUE(organization_id, crm_type),
  CONSTRAINT one_primary_per_org UNIQUE(organization_id, is_primary) WHERE is_primary = true
);

-- CRM field mappings table
CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Link to integration
  integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  
  -- Field mapping
  our_field VARCHAR(100) NOT NULL, -- Our standard field name
  their_field VARCHAR(255) NOT NULL, -- CRM's field name/path
  
  -- Field configuration
  field_type VARCHAR(50) NOT NULL, -- text, phone, email, array, json
  direction VARCHAR(20) DEFAULT 'bidirectional', -- inbound, outbound, bidirectional
  
  -- Transformation rules
  transformation_rules JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  -- For phone: { "format": "E164", "strip_country_code": false }
  -- For array: { "path": "phones[0].value", "extract": "first" }
  -- For custom: { "script": "value.toLowerCase().replace(' ', '_')" }
  
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_field_mapping UNIQUE(integration_id, our_field)
);

-- Default field mappings for each CRM type
CREATE TABLE IF NOT EXISTS crm_default_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  crm_type crm_type NOT NULL,
  our_field VARCHAR(100) NOT NULL,
  their_field VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  transformation_rules JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT unique_default_mapping UNIQUE(crm_type, our_field)
);

-- Insert default mappings for Follow Up Boss
INSERT INTO crm_default_mappings (crm_type, our_field, their_field, field_type, transformation_rules) VALUES
  ('fub', 'first_name', 'firstName', 'text', '{}'),
  ('fub', 'last_name', 'lastName', 'text', '{}'),
  ('fub', 'email', 'emails[0].value', 'email', '{"extract": "first", "path": "emails"}'),
  ('fub', 'phone', 'phones[0].value', 'phone', '{"extract": "first", "path": "phones", "format": "E164"}'),
  ('fub', 'source', 'source', 'text', '{}'),
  ('fub', 'tags', 'tags', 'array', '{"type": "string_array"}'),
  ('fub', 'stage', 'stage', 'text', '{}'),
  ('fub', 'assigned_to', 'assignedUserId', 'text', '{}'),
  ('fub', 'notes', 'background', 'text', '{}'),
  ('fub', 'external_id', 'id', 'text', '{}'),
  ('fub', 'created_at', 'created', 'timestamp', '{}'),
  ('fub', 'updated_at', 'updated', 'timestamp', '{}'),
  ('fub', 'custom_ai_status', 'customEugeniaTalkingStatus', 'text', '{}'),
  ('fub', 'custom_ai_link', 'customAimAssist', 'text', '{}'),
  ('fub', 'custom_ai_paused', 'customEugeniaPausedUntil', 'timestamp', '{}')
ON CONFLICT (crm_type, our_field) DO NOTHING;

-- Insert default mappings for Lofty (placeholder)
INSERT INTO crm_default_mappings (crm_type, our_field, their_field, field_type, transformation_rules) VALUES
  ('lofty', 'first_name', 'contact.first_name', 'text', '{}'),
  ('lofty', 'last_name', 'contact.last_name', 'text', '{}'),
  ('lofty', 'email', 'contact.email', 'email', '{}'),
  ('lofty', 'phone', 'contact.phone_number', 'phone', '{"format": "E164"}'),
  ('lofty', 'source', 'lead_source', 'text', '{}'),
  ('lofty', 'tags', 'tags', 'array', '{"type": "string_array"}'),
  ('lofty', 'external_id', 'id', 'text', '{}')
ON CONFLICT (crm_type, our_field) DO NOTHING;

-- Function to apply field mappings
CREATE OR REPLACE FUNCTION apply_field_mapping(
  integration_id UUID,
  data JSONB,
  direction TEXT DEFAULT 'outbound'
) RETURNS JSONB AS $$
DECLARE
  mapped_data JSONB := '{}'::jsonb;
  mapping RECORD;
  field_value TEXT;
  transformed_value JSONB;
BEGIN
  -- Get all mappings for this integration
  FOR mapping IN 
    SELECT * FROM crm_field_mappings 
    WHERE crm_field_mappings.integration_id = apply_field_mapping.integration_id
    AND (crm_field_mappings.direction = apply_field_mapping.direction 
         OR crm_field_mappings.direction = 'bidirectional')
  LOOP
    -- Extract value based on direction
    IF direction = 'outbound' THEN
      -- Our field to their field
      field_value := data->>mapping.our_field;
      
      IF field_value IS NOT NULL THEN
        -- Apply transformations
        CASE mapping.field_type
          WHEN 'phone' THEN
            -- Format phone number
            IF mapping.transformation_rules->>'format' = 'E164' THEN
              field_value := regexp_replace(field_value, '[^0-9]', '', 'g');
              IF length(field_value) = 10 THEN
                field_value := '+1' || field_value;
              ELSIF length(field_value) = 11 AND substring(field_value, 1, 1) = '1' THEN
                field_value := '+' || field_value;
              END IF;
            END IF;
          WHEN 'array' THEN
            -- Handle array transformations
            transformed_value := to_jsonb(string_to_array(field_value, ','));
          ELSE
            -- Default: use as-is
            transformed_value := to_jsonb(field_value);
        END CASE;
        
        -- Set the mapped field
        mapped_data := jsonb_set(mapped_data, string_to_array(mapping.their_field, '.'), 
                                 COALESCE(transformed_value, to_jsonb(field_value)));
      END IF;
    ELSE
      -- Their field to our field (inbound)
      -- Extract using path notation
      field_value := jsonb_extract_path_text(data, VARIADIC string_to_array(mapping.their_field, '.'));
      
      IF field_value IS NOT NULL THEN
        mapped_data := jsonb_set(mapped_data, ARRAY[mapping.our_field], to_jsonb(field_value));
      END IF;
    END IF;
  END LOOP;
  
  RETURN mapped_data;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize field mappings from defaults
CREATE OR REPLACE FUNCTION initialize_crm_field_mappings(
  p_integration_id UUID
) RETURNS VOID AS $$
DECLARE
  v_crm_type crm_type;
BEGIN
  -- Get CRM type
  SELECT crm_type INTO v_crm_type
  FROM crm_integrations
  WHERE id = p_integration_id;
  
  -- Copy default mappings
  INSERT INTO crm_field_mappings (
    integration_id,
    our_field,
    their_field,
    field_type,
    transformation_rules
  )
  SELECT 
    p_integration_id,
    our_field,
    their_field,
    field_type,
    transformation_rules
  FROM crm_default_mappings
  WHERE crm_type = v_crm_type
  ON CONFLICT (integration_id, our_field) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Webhook processing log
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  integration_id UUID REFERENCES crm_integrations(id) ON DELETE CASCADE,
  
  -- Request details
  webhook_type VARCHAR(50),
  raw_payload JSONB,
  headers JSONB,
  
  -- Processing
  processed_at TIMESTAMPTZ,
  processing_status VARCHAR(50) DEFAULT 'pending',
  processed_data JSONB,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_crm_integrations_org ON crm_integrations(organization_id);
CREATE INDEX idx_crm_integrations_active ON crm_integrations(organization_id, is_active);
CREATE INDEX idx_crm_field_mappings_integration ON crm_field_mappings(integration_id);
CREATE INDEX idx_webhook_logs_integration ON webhook_logs(integration_id, created_at DESC);

-- Enable RLS
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY crm_integrations_org_isolation ON crm_integrations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

CREATE POLICY crm_field_mappings_org_isolation ON crm_field_mappings
  FOR ALL
  USING (
    integration_id IN (
      SELECT id FROM crm_integrations 
      WHERE organization_id IN (
        SELECT organization_id FROM agents 
        WHERE user_id = auth.uid()
        AND deleted_at IS NULL
      )
    )
  );

CREATE POLICY webhook_logs_org_isolation ON webhook_logs
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM crm_integrations 
      WHERE organization_id IN (
        SELECT organization_id FROM agents 
        WHERE user_id = auth.uid()
        AND deleted_at IS NULL
      )
    )
  );

-- Triggers
CREATE TRIGGER update_crm_integrations_updated_at 
  BEFORE UPDATE ON crm_integrations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_field_mappings_updated_at 
  BEFORE UPDATE ON crm_field_mappings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE crm_integrations IS 'CRM integration configurations with encrypted credentials';
COMMENT ON TABLE crm_field_mappings IS 'Dynamic field mapping between our schema and CRM fields';
COMMENT ON TABLE crm_default_mappings IS 'Default field mappings for each CRM type';
COMMENT ON TABLE webhook_logs IS 'Incoming webhook processing log';
COMMENT ON FUNCTION apply_field_mapping IS 'Transform data between our schema and CRM schema';
COMMENT ON FUNCTION initialize_crm_field_mappings IS 'Set up default field mappings for new integration';-- Migration 005: Leads Table
-- Purpose: Flexible lead storage with JSONB for CRM-specific data

CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Agent assignment
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- External CRM IDs (supports multiple CRMs)
  external_ids JSONB DEFAULT '{}'::jsonb,
  -- Example: {"fub": "123456", "lofty": "abc-def-ghi"}
  
  -- Core lead information
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  
  -- Phone numbers (array for multiple phones)
  phones JSONB DEFAULT '[]'::jsonb,
  -- Format: ["+17065551234", "+14045556789"]
  
  -- Lead source and metadata
  source VARCHAR(100),
  tags TEXT[],
  stage VARCHAR(50),
  score INTEGER DEFAULT 0,
  
  -- AI engagement status
  ai_status VARCHAR(50) DEFAULT 'pending',
  ai_enabled BOOLEAN DEFAULT true,
  ai_paused_until TIMESTAMPTZ,
  ai_pause_reason TEXT,
  last_ai_interaction TIMESTAMPTZ,
  
  -- Flexible CRM data storage
  crm_data JSONB DEFAULT '{}'::jsonb,
  -- Stores any CRM-specific fields not in our schema
  
  -- Custom fields for AI context
  custom_fields JSONB DEFAULT '{}'::jsonb,
  -- Example: {"property_interest": "3-bedroom", "budget": "$500k"}
  
  -- Activity tracking
  last_activity_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Create GIN index for phone number searching
CREATE INDEX idx_leads_phones_gin ON leads USING GIN (phones);

-- Create other indexes
CREATE INDEX idx_leads_organization ON leads(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON leads(assigned_agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_external_ids ON leads USING GIN (external_ids);
CREATE INDEX idx_leads_ai_status ON leads(organization_id, ai_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_email ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_created ON leads(organization_id, created_at DESC);
CREATE INDEX idx_leads_activity ON leads(organization_id, last_activity_at DESC NULLS LAST);
CREATE INDEX idx_leads_tags ON leads USING GIN (tags) WHERE deleted_at IS NULL;

-- Function to search leads by phone number
CREATE OR REPLACE FUNCTION find_lead_by_phone(
  p_organization_id UUID,
  p_phone VARCHAR(20)
) RETURNS TABLE (
  lead_id UUID,
  lead_name TEXT,
  phones JSONB,
  ai_status VARCHAR(50)
) AS $$
DECLARE
  normalized_phone VARCHAR(20);
  search_patterns TEXT[];
BEGIN
  -- Normalize the phone number
  normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Create search patterns
  IF length(normalized_phone) = 10 THEN
    -- US number without country code
    search_patterns := ARRAY[
      normalized_phone,
      '1' || normalized_phone,
      '+1' || normalized_phone
    ];
  ELSIF length(normalized_phone) = 11 AND substring(normalized_phone, 1, 1) = '1' THEN
    -- US number with country code
    search_patterns := ARRAY[
      substring(normalized_phone, 2),
      normalized_phone,
      '+' || normalized_phone
    ];
  ELSE
    search_patterns := ARRAY[normalized_phone];
  END IF;
  
  RETURN QUERY
  SELECT 
    l.id as lead_id,
    CONCAT(l.first_name, ' ', l.last_name) as lead_name,
    l.phones,
    l.ai_status
  FROM leads l
  WHERE l.organization_id = p_organization_id
  AND l.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements_text(l.phones) AS phone
    WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ANY(search_patterns)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update lead from CRM data
CREATE OR REPLACE FUNCTION update_lead_from_crm(
  p_organization_id UUID,
  p_external_id TEXT,
  p_crm_type TEXT,
  p_crm_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_lead_id UUID;
  v_phones JSONB;
BEGIN
  -- Extract phones if present
  v_phones := '[]'::jsonb;
  IF p_crm_data->'phones' IS NOT NULL THEN
    v_phones := p_crm_data->'phones';
  ELSIF p_crm_data->>'phone' IS NOT NULL THEN
    v_phones := jsonb_build_array(p_crm_data->>'phone');
  END IF;
  
  -- Find existing lead by external ID
  SELECT id INTO v_lead_id
  FROM leads
  WHERE organization_id = p_organization_id
  AND external_ids->>p_crm_type = p_external_id
  AND deleted_at IS NULL;
  
  IF v_lead_id IS NULL THEN
    -- Create new lead
    INSERT INTO leads (
      organization_id,
      external_ids,
      first_name,
      last_name,
      email,
      phones,
      source,
      crm_data,
      created_at
    ) VALUES (
      p_organization_id,
      jsonb_build_object(p_crm_type, p_external_id),
      p_crm_data->>'first_name',
      p_crm_data->>'last_name',
      p_crm_data->>'email',
      v_phones,
      p_crm_data->>'source',
      p_crm_data,
      NOW()
    )
    RETURNING id INTO v_lead_id;
    
    -- Increment lead count
    PERFORM increment_organization_usage(p_organization_id, 'leads', 1);
  ELSE
    -- Update existing lead
    UPDATE leads
    SET 
      first_name = COALESCE(p_crm_data->>'first_name', first_name),
      last_name = COALESCE(p_crm_data->>'last_name', last_name),
      email = COALESCE(p_crm_data->>'email', email),
      phones = CASE 
        WHEN jsonb_array_length(v_phones) > 0 THEN v_phones 
        ELSE phones 
      END,
      source = COALESCE(p_crm_data->>'source', source),
      crm_data = p_crm_data,
      updated_at = NOW()
    WHERE id = v_lead_id;
  END IF;
  
  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY leads_org_isolation ON leads
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at 
  BEFORE UPDATE ON leads 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE leads IS 'Flexible lead storage with JSONB for multi-CRM support';
COMMENT ON COLUMN leads.external_ids IS 'CRM-specific IDs stored as JSONB for multi-CRM support';
COMMENT ON COLUMN leads.phones IS 'Array of phone numbers in various formats';
COMMENT ON COLUMN leads.crm_data IS 'Raw CRM data for fields not in our schema';
COMMENT ON FUNCTION find_lead_by_phone IS 'Find leads by phone number with normalization';
COMMENT ON FUNCTION update_lead_from_crm IS 'Create or update lead from CRM webhook data';-- Migration 006: Conversations Table
-- Purpose: Track conversation threads between AI and leads

CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Conversation details
  channel VARCHAR(20) DEFAULT 'sms', -- sms, email, voice, web
  status conversation_status DEFAULT 'active',
  
  -- AI configuration for this conversation
  ai_enabled BOOLEAN DEFAULT true,
  ai_provider ai_provider,
  ai_model VARCHAR(100),
  ai_temperature DECIMAL(3,2),
  ai_max_tokens INTEGER,
  
  -- Metrics
  message_count INTEGER DEFAULT 0,
  inbound_count INTEGER DEFAULT 0,
  outbound_count INTEGER DEFAULT 0,
  ai_message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Qualification tracking
  qualification_status qualification_status DEFAULT 'not_qualified',
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  
  -- Context summary for AI (periodically updated)
  context_summary JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "lead_interest": "3-bedroom homes",
  --   "timeline": "3-6 months",
  --   "budget": "$400-500k",
  --   "key_points": ["preapproved", "first-time buyer"]
  -- }
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(organization_id, status);
CREATE INDEX idx_conversations_qualified ON conversations(organization_id, qualification_status);
CREATE INDEX idx_conversations_activity ON conversations(organization_id, last_message_at DESC);
CREATE UNIQUE INDEX idx_conversations_unique_lead_channel ON conversations(lead_id, channel) 
  WHERE status != 'archived';

-- Function to get or create conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_organization_id UUID,
  p_lead_id UUID,
  p_channel VARCHAR(20) DEFAULT 'sms'
) RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_ai_provider ai_provider;
  v_ai_settings JSONB;
BEGIN
  -- Try to find existing active conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE lead_id = p_lead_id
  AND channel = p_channel
  AND status IN ('active', 'paused')
  LIMIT 1;
  
  IF v_conversation_id IS NULL THEN
    -- Get AI settings from organization
    SELECT 
      COALESCE(settings->>'ai_provider', 'claude')::ai_provider,
      settings
    INTO v_ai_provider, v_ai_settings
    FROM organizations
    WHERE id = p_organization_id;
    
    -- Create new conversation
    INSERT INTO conversations (
      organization_id,
      lead_id,
      channel,
      ai_provider,
      ai_temperature,
      ai_max_tokens
    ) VALUES (
      p_organization_id,
      p_lead_id,
      p_channel,
      v_ai_provider,
      COALESCE((v_ai_settings->>'ai_temperature')::DECIMAL, 0.7),
      COALESCE((v_ai_settings->>'ai_max_tokens')::INTEGER, 1000)
    )
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation metrics
CREATE OR REPLACE FUNCTION update_conversation_metrics(
  p_conversation_id UUID,
  p_direction message_direction,
  p_sender_type sender_type
) RETURNS VOID AS $$
BEGIN
  UPDATE conversations
  SET
    message_count = message_count + 1,
    inbound_count = CASE 
      WHEN p_direction = 'inbound' THEN inbound_count + 1 
      ELSE inbound_count 
    END,
    outbound_count = CASE 
      WHEN p_direction = 'outbound' THEN outbound_count + 1 
      ELSE outbound_count 
    END,
    ai_message_count = CASE 
      WHEN p_sender_type = 'ai' THEN ai_message_count + 1 
      ELSE ai_message_count 
    END,
    agent_message_count = CASE 
      WHEN p_sender_type = 'agent' THEN agent_message_count + 1 
      ELSE agent_message_count 
    END,
    last_message_at = NOW(),
    last_inbound_at = CASE 
      WHEN p_direction = 'inbound' THEN NOW() 
      ELSE last_inbound_at 
    END,
    last_outbound_at = CASE 
      WHEN p_direction = 'outbound' THEN NOW() 
      ELSE last_outbound_at 
    END,
    updated_at = NOW()
  WHERE id = p_conversation_id;
  
  -- Also update lead activity
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
    END
  WHERE id = (SELECT lead_id FROM conversations WHERE id = p_conversation_id);
END;
$$ LANGUAGE plpgsql;

-- Function to check if conversation should be qualified
CREATE OR REPLACE FUNCTION check_conversation_qualification(
  p_conversation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_qualification JSONB;
  v_message_count INTEGER;
  v_key_questions_answered INTEGER := 0;
BEGIN
  -- Get current conversation metrics
  SELECT 
    context_summary,
    inbound_count
  INTO v_qualification, v_message_count
  FROM conversations
  WHERE id = p_conversation_id;
  
  -- Check key qualification criteria
  IF v_qualification->>'timeline' IS NOT NULL THEN
    v_key_questions_answered := v_key_questions_answered + 1;
  END IF;
  
  IF v_qualification->>'budget' IS NOT NULL THEN
    v_key_questions_answered := v_key_questions_answered + 1;
  END IF;
  
  IF v_qualification->>'working_with_agent' IS NOT NULL THEN
    v_key_questions_answered := v_key_questions_answered + 1;
  END IF;
  
  -- Qualify if:
  -- 1. All 3 key questions answered
  -- 2. Or 2+ questions answered with 4+ messages
  -- 3. Or explicit phone/meeting request
  IF v_key_questions_answered >= 3 OR 
     (v_key_questions_answered >= 2 AND v_message_count >= 4) OR
     (v_qualification->>'wants_phone_call')::BOOLEAN = true OR
     (v_qualification->>'wants_meeting')::BOOLEAN = true THEN
    
    -- Update qualification status
    UPDATE conversations
    SET 
      qualification_status = 'qualified',
      qualified_at = NOW(),
      qualification_reason = CASE
        WHEN (v_qualification->>'wants_phone_call')::BOOLEAN = true THEN 'Requested phone call'
        WHEN (v_qualification->>'wants_meeting')::BOOLEAN = true THEN 'Requested meeting'
        WHEN v_key_questions_answered >= 3 THEN 'Answered all qualification questions'
        ELSE 'High engagement with key info provided'
      END
    WHERE id = p_conversation_id;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY conversations_org_isolation ON conversations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE conversations IS 'Conversation threads between AI/agents and leads';
COMMENT ON COLUMN conversations.context_summary IS 'AI-extracted context for quick reference';
COMMENT ON COLUMN conversations.qualification_status IS 'Lead qualification progress';
COMMENT ON FUNCTION get_or_create_conversation IS 'Get existing or create new conversation';
COMMENT ON FUNCTION update_conversation_metrics IS 'Update conversation and lead metrics';
COMMENT ON FUNCTION check_conversation_qualification IS 'Check if lead should be marked qualified';-- Migration 007: Messages Table (Partitioned for Scale)
-- Purpose: Store millions of messages efficiently with monthly partitioning

-- Create the parent partitioned table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid(),
  
  -- Ownership (denormalized for partition performance)
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  
  -- Message details
  direction message_direction NOT NULL,
  sender_type sender_type NOT NULL,
  sender_id UUID, -- agent_id if sent by agent, null for lead/ai
  
  -- Content
  content TEXT NOT NULL,
  
  -- Phone details (for SMS)
  from_phone VARCHAR(20),
  to_phone VARCHAR(20),
  
  -- Provider details
  provider VARCHAR(20), -- twilio, telnyx, etc.
  provider_message_id VARCHAR(255), -- Twilio SID, etc.
  provider_status VARCHAR(50), -- sent, delivered, failed, etc.
  provider_error TEXT,
  
  -- AI details (if AI generated)
  ai_provider ai_provider,
  ai_model VARCHAR(100),
  ai_temperature DECIMAL(3,2),
  ai_prompt_tokens INTEGER,
  ai_completion_tokens INTEGER,
  ai_total_cost DECIMAL(10,4), -- in dollars
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Primary key includes created_at for partitioning
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes on parent table (inherited by partitions)
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX idx_messages_organization ON messages(organization_id, created_at DESC);
CREATE INDEX idx_messages_provider_id ON messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Function to create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition(
  table_name TEXT,
  start_date DATE
) RETURNS TEXT AS $$
DECLARE
  partition_name TEXT;
  end_date DATE;
BEGIN
  partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
  end_date := start_date + INTERVAL '1 month';
  
  -- Check if partition already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class 
    WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      table_name,
      start_date,
      end_date
    );
    
    -- Add partition-specific indexes if needed
    EXECUTE format(
      'CREATE INDEX idx_%s_created ON %I(created_at)',
      partition_name,
      partition_name
    );
  END IF;
  
  RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create partitions for next 3 months
CREATE OR REPLACE FUNCTION ensure_message_partitions()
RETURNS VOID AS $$
DECLARE
  current_month DATE;
  i INTEGER;
BEGIN
  current_month := date_trunc('month', CURRENT_DATE);
  
  -- Create partitions for current month and next 2 months
  FOR i IN 0..2 LOOP
    PERFORM create_monthly_partition('messages', current_month + (i || ' months')::INTERVAL);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create initial partitions
SELECT ensure_message_partitions();

-- Schedule partition creation (would use pg_cron in production)
-- This is a placeholder - in production, set up pg_cron to run this monthly
COMMENT ON FUNCTION ensure_message_partitions IS 
  'Run this monthly via pg_cron: SELECT ensure_message_partitions();';

-- Function to insert message and update metrics
CREATE OR REPLACE FUNCTION insert_message(
  p_organization_id UUID,
  p_conversation_id UUID,
  p_lead_id UUID,
  p_direction message_direction,
  p_sender_type sender_type,
  p_content TEXT,
  p_from_phone VARCHAR(20) DEFAULT NULL,
  p_to_phone VARCHAR(20) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
BEGIN
  -- Insert message
  INSERT INTO messages (
    organization_id,
    conversation_id,
    lead_id,
    direction,
    sender_type,
    content,
    from_phone,
    to_phone,
    metadata,
    created_at
  ) VALUES (
    p_organization_id,
    p_conversation_id,
    p_lead_id,
    p_direction,
    p_sender_type,
    p_content,
    p_from_phone,
    p_to_phone,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_message_id;
  
  -- Update conversation metrics
  PERFORM update_conversation_metrics(p_conversation_id, p_direction, p_sender_type);
  
  -- Check organization SMS limit if outbound
  IF p_direction = 'outbound' THEN
    PERFORM increment_organization_usage(p_organization_id, 'sms', 1);
  END IF;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent messages for a conversation
CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before_date TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  message_id UUID,
  direction message_direction,
  sender_type sender_type,
  content TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id as message_id,
    m.direction,
    m.sender_type,
    m.content,
    m.created_at,
    m.metadata
  FROM messages m
  WHERE m.conversation_id = p_conversation_id
  AND (p_before_date IS NULL OR m.created_at < p_before_date)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old partitions (keep last 6 months)
CREATE OR REPLACE FUNCTION drop_old_partitions(
  months_to_keep INTEGER DEFAULT 6
) RETURNS VOID AS $$
DECLARE
  cutoff_date DATE;
  partition_record RECORD;
BEGIN
  cutoff_date := date_trunc('month', CURRENT_DATE - (months_to_keep || ' months')::INTERVAL);
  
  FOR partition_record IN
    SELECT 
      schemaname,
      tablename
    FROM pg_tables
    WHERE tablename LIKE 'messages_%'
    AND tablename ~ 'messages_[0-9]{4}_[0-9]{2}$'
  LOOP
    -- Extract date from partition name
    IF to_date(right(partition_record.tablename, 7), 'YYYY_MM') < cutoff_date THEN
      EXECUTE format('DROP TABLE IF EXISTS %I.%I', 
                     partition_record.schemaname, 
                     partition_record.tablename);
      RAISE NOTICE 'Dropped partition: %', partition_record.tablename;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on parent table (inherited by partitions)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY messages_org_isolation ON messages
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

-- Trigger to update conversation on message insert
CREATE OR REPLACE FUNCTION after_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Update last message timestamp on conversation
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Triggers on partitioned tables work differently
-- This trigger will be inherited by all partitions
CREATE TRIGGER after_message_insert_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION after_message_insert();

-- Comments
COMMENT ON TABLE messages IS 'Partitioned message storage for scale (monthly partitions)';
COMMENT ON FUNCTION create_monthly_partition IS 'Create a new monthly partition for messages';
COMMENT ON FUNCTION ensure_message_partitions IS 'Ensure partitions exist for next 3 months';
COMMENT ON FUNCTION insert_message IS 'Insert message with automatic metric updates';
COMMENT ON FUNCTION get_conversation_messages IS 'Get recent messages for a conversation';
COMMENT ON FUNCTION drop_old_partitions IS 'Clean up old message partitions';-- Migration 008: AI Context and Qualification
-- Purpose: Track AI interactions, context, and lead qualification

-- AI Context Snapshots
CREATE TABLE IF NOT EXISTS ai_contexts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Context data
  context_type VARCHAR(50) DEFAULT 'conversation', -- conversation, qualification, summary
  context_data JSONB NOT NULL,
  -- Example: {
  --   "messages": [...last 20 messages...],
  --   "lead_profile": {...},
  --   "extracted_info": {
  --     "timeline": "3-6 months",
  --     "budget": "$400-500k",
  --     "property_type": "single family",
  --     "pre_approved": true
  --   }
  -- }
  
  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  
  -- AI details
  ai_provider ai_provider,
  ai_model VARCHAR(100),
  ai_response JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Qualification Tracking
CREATE TABLE IF NOT EXISTS lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Key qualification questions
  timeline_to_move TEXT,
  timeline_confidence DECIMAL(3,2),
  
  working_with_agent BOOLEAN,
  agent_status_confidence DECIMAL(3,2),
  
  financing_status TEXT, -- pre_approved, cash, need_financing, unknown
  financing_confidence DECIMAL(3,2),
  
  budget_range TEXT,
  budget_confidence DECIMAL(3,2),
  
  -- Property preferences
  property_type TEXT,
  desired_location TEXT,
  must_haves JSONB DEFAULT '[]'::jsonb,
  
  -- Qualification scoring
  qualification_score INTEGER DEFAULT 0, -- 0-100
  is_qualified BOOLEAN DEFAULT false,
  qualification_reason TEXT,
  qualified_at TIMESTAMPTZ,
  
  -- Interest indicators
  wants_phone_call BOOLEAN DEFAULT false,
  wants_showing BOOLEAN DEFAULT false,
  wants_more_info BOOLEAN DEFAULT false,
  urgency_level VARCHAR(20), -- high, medium, low
  
  -- AI extraction details
  last_analyzed_at TIMESTAMPTZ,
  extraction_confidence DECIMAL(3,2),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique per lead
  CONSTRAINT unique_lead_qualification UNIQUE(lead_id)
);

-- AI Prompts and Templates
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Prompt details
  name VARCHAR(100) NOT NULL,
  prompt_type VARCHAR(50) NOT NULL, -- initial_outreach, reply, qualification, follow_up
  
  -- The actual prompt template
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  
  -- Variables this prompt expects
  required_variables TEXT[],
  optional_variables TEXT[],
  
  -- Configuration
  ai_provider ai_provider,
  model_preferences JSONB DEFAULT '{}'::jsonb,
  -- Example: {"temperature": 0.7, "max_tokens": 1000}
  
  -- Usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Performance metrics
  avg_response_time_ms INTEGER,
  success_rate DECIMAL(5,2),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique name per org
  CONSTRAINT unique_prompt_name_per_org UNIQUE(organization_id, name)
);

-- Function to extract qualification from conversation
CREATE OR REPLACE FUNCTION extract_qualification_from_context(
  p_lead_id UUID,
  p_context JSONB
) RETURNS VOID AS $$
DECLARE
  v_qualification RECORD;
  v_org_id UUID;
  v_conversation_id UUID;
BEGIN
  -- Get organization and conversation
  SELECT 
    l.organization_id,
    c.id
  INTO v_org_id, v_conversation_id
  FROM leads l
  LEFT JOIN conversations c ON c.lead_id = l.id AND c.status = 'active'
  WHERE l.id = p_lead_id;
  
  -- Extract qualification data from context
  -- This is simplified - in production, use AI to extract
  INSERT INTO lead_qualifications (
    organization_id,
    lead_id,
    conversation_id,
    timeline_to_move,
    working_with_agent,
    financing_status,
    budget_range,
    property_type,
    desired_location,
    wants_phone_call,
    wants_showing,
    last_analyzed_at
  ) VALUES (
    v_org_id,
    p_lead_id,
    v_conversation_id,
    p_context->>'timeline',
    (p_context->>'working_with_agent')::BOOLEAN,
    p_context->>'financing',
    p_context->>'budget',
    p_context->>'property_type',
    p_context->>'location',
    (p_context->>'wants_phone')::BOOLEAN,
    (p_context->>'wants_showing')::BOOLEAN,
    NOW()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    timeline_to_move = COALESCE(EXCLUDED.timeline_to_move, lead_qualifications.timeline_to_move),
    working_with_agent = COALESCE(EXCLUDED.working_with_agent, lead_qualifications.working_with_agent),
    financing_status = COALESCE(EXCLUDED.financing_status, lead_qualifications.financing_status),
    budget_range = COALESCE(EXCLUDED.budget_range, lead_qualifications.budget_range),
    property_type = COALESCE(EXCLUDED.property_type, lead_qualifications.property_type),
    desired_location = COALESCE(EXCLUDED.desired_location, lead_qualifications.desired_location),
    wants_phone_call = EXCLUDED.wants_phone_call OR lead_qualifications.wants_phone_call,
    wants_showing = EXCLUDED.wants_showing OR lead_qualifications.wants_showing,
    last_analyzed_at = NOW(),
    updated_at = NOW();
  
  -- Calculate qualification score
  PERFORM calculate_qualification_score(p_lead_id);
END;
$$ LANGUAGE plpgsql;

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
  
  -- Score based on key factors (customize as needed)
  IF v_qual.timeline_to_move IS NOT NULL THEN
    v_score := v_score + 20;
    IF v_qual.timeline_to_move ILIKE '%month%' OR v_qual.timeline_to_move ILIKE '%soon%' THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  IF v_qual.working_with_agent = false THEN
    v_score := v_score + 25;
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
  
  -- Update the score and qualification status
  UPDATE lead_qualifications
  SET 
    qualification_score = v_score,
    is_qualified = v_score >= 60,
    qualification_reason = CASE
      WHEN v_score >= 80 THEN 'Highly qualified - ready to engage'
      WHEN v_score >= 60 THEN 'Qualified - good prospect'
      WHEN v_score >= 40 THEN 'Partially qualified - needs nurturing'
      ELSE 'Not yet qualified - early stage'
    END,
    qualified_at = CASE 
      WHEN v_score >= 60 AND qualified_at IS NULL THEN NOW()
      ELSE qualified_at
    END
  WHERE lead_id = p_lead_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Indexes
CREATE INDEX idx_ai_contexts_conversation ON ai_contexts(conversation_id);
CREATE INDEX idx_ai_contexts_created ON ai_contexts(created_at DESC);
CREATE INDEX idx_lead_qualifications_lead ON lead_qualifications(lead_id);
CREATE INDEX idx_lead_qualifications_qualified ON lead_qualifications(is_qualified, qualified_at);
CREATE INDEX idx_ai_prompts_org ON ai_prompts(organization_id);
CREATE INDEX idx_ai_prompts_type ON ai_prompts(organization_id, prompt_type, is_active);

-- Enable RLS
ALTER TABLE ai_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY ai_contexts_org_isolation ON ai_contexts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

CREATE POLICY lead_qualifications_org_isolation ON lead_qualifications
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

CREATE POLICY ai_prompts_org_isolation ON ai_prompts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND deleted_at IS NULL
    )
  );

-- Triggers
CREATE TRIGGER update_lead_qualifications_updated_at 
  BEFORE UPDATE ON lead_qualifications 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_prompts_updated_at 
  BEFORE UPDATE ON ai_prompts 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE ai_contexts IS 'AI context snapshots for conversations';
COMMENT ON TABLE lead_qualifications IS 'Lead qualification tracking and scoring';
COMMENT ON TABLE ai_prompts IS 'Customizable AI prompt templates';
COMMENT ON FUNCTION extract_qualification_from_context IS 'Extract qualification data from conversation context';
COMMENT ON FUNCTION calculate_qualification_score IS 'Calculate lead qualification score';-- Migration 009: Final Indexes, RLS, and Helper Functions
-- Purpose: Complete performance optimization and security setup

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_lookup 
  ON leads(organization_id, deleted_at) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_active 
  ON conversations(lead_id, status) 
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_agents_org_active 
  ON agents(organization_id, is_active) 
  WHERE is_active = true AND deleted_at IS NULL;

-- Function to get complete lead context for AI
CREATE OR REPLACE FUNCTION get_lead_context_for_ai(
  p_lead_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_context JSONB;
  v_lead RECORD;
  v_qualification RECORD;
  v_recent_messages JSONB;
BEGIN
  -- Get lead data
  SELECT 
    l.*,
    o.name as organization_name,
    o.settings as org_settings
  INTO v_lead
  FROM leads l
  JOIN organizations o ON o.id = l.organization_id
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get qualification data
  SELECT * INTO v_qualification
  FROM lead_qualifications
  WHERE lead_id = p_lead_id;
  
  -- Get recent messages
  SELECT jsonb_agg(
    jsonb_build_object(
      'direction', m.direction,
      'sender', m.sender_type,
      'content', m.content,
      'created_at', m.created_at
    ) ORDER BY m.created_at DESC
  ) INTO v_recent_messages
  FROM (
    SELECT * FROM messages
    WHERE lead_id = p_lead_id
    ORDER BY created_at DESC
    LIMIT 20
  ) m;
  
  -- Build context object
  v_context := jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'name', CONCAT(v_lead.first_name, ' ', v_lead.last_name),
      'email', v_lead.email,
      'phones', v_lead.phones,
      'source', v_lead.source,
      'tags', v_lead.tags,
      'custom_fields', v_lead.custom_fields
    ),
    'organization', jsonb_build_object(
      'name', v_lead.organization_name,
      'settings', v_lead.org_settings
    ),
    'qualification', CASE 
      WHEN v_qualification.id IS NOT NULL THEN
        jsonb_build_object(
          'timeline', v_qualification.timeline_to_move,
          'working_with_agent', v_qualification.working_with_agent,
          'financing', v_qualification.financing_status,
          'budget', v_qualification.budget_range,
          'score', v_qualification.qualification_score,
          'is_qualified', v_qualification.is_qualified
        )
      ELSE NULL
    END,
    'recent_messages', COALESCE(v_recent_messages, '[]'::jsonb),
    'message_count', v_lead.message_count,
    'last_activity', v_lead.last_activity_at
  );
  
  RETURN v_context;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for multi-tenant data isolation check
CREATE OR REPLACE FUNCTION verify_tenant_isolation(
  p_user_id UUID,
  p_organization_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM agents
    WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND is_active = true
    AND deleted_at IS NULL
  ) INTO v_has_access;
  
  RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage tracking view for billing
CREATE OR REPLACE VIEW organization_usage_summary AS
SELECT 
  o.id as organization_id,
  o.name as organization_name,
  o.subscription_plan,
  o.current_usage,
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT c.id) as total_conversations,
  COUNT(DISTINCT a.id) as active_agents,
  (
    SELECT COUNT(*) 
    FROM messages m 
    WHERE m.organization_id = o.id 
    AND m.created_at >= date_trunc('month', CURRENT_DATE)
  ) as messages_this_month
FROM organizations o
LEFT JOIN leads l ON l.organization_id = o.id AND l.deleted_at IS NULL
LEFT JOIN conversations c ON c.organization_id = o.id
LEFT JOIN agents a ON a.organization_id = o.id AND a.is_active = true AND a.deleted_at IS NULL
WHERE o.deleted_at IS NULL
GROUP BY o.id;

-- Grant appropriate permissions
GRANT SELECT ON organization_usage_summary TO authenticated;

-- Audit log table for compliance
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Actor
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- Action details
  action VARCHAR(50) NOT NULL, -- create, update, delete, view
  entity_type VARCHAR(50) NOT NULL, -- lead, message, conversation, etc.
  entity_id UUID,
  
  -- Change details
  old_values JSONB,
  new_values JSONB,
  
  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition audit logs by month for performance
ALTER TABLE audit_logs 
  PARTITION BY RANGE (created_at);

-- Create first partition
SELECT create_monthly_partition('audit_logs', date_trunc('month', CURRENT_DATE));

-- Index for audit queries
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_action VARCHAR(50),
  p_entity_type VARCHAR(50),
  p_entity_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    get_agent_organization(auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Final RLS policy for audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- System health check function
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details JSONB
) AS $$
BEGIN
  RETURN QUERY
  
  -- Check partition creation
  SELECT 
    'Message Partitions'::TEXT,
    CASE 
      WHEN COUNT(*) >= 3 THEN 'OK'::TEXT
      ELSE 'WARNING'::TEXT
    END,
    jsonb_build_object('partition_count', COUNT(*))
  FROM pg_tables
  WHERE tablename LIKE 'messages_%';
  
  UNION ALL
  
  -- Check organizations
  SELECT 
    'Organizations'::TEXT,
    CASE 
      WHEN COUNT(*) > 0 THEN 'OK'::TEXT
      ELSE 'WARNING'::TEXT
    END,
    jsonb_build_object('total', COUNT(*))
  FROM organizations
  WHERE deleted_at IS NULL;
  
  UNION ALL
  
  -- Check RLS is enabled
  SELECT 
    'Row Level Security'::TEXT,
    CASE 
      WHEN COUNT(*) = 11 THEN 'OK'::TEXT -- All our tables
      ELSE 'WARNING'::TEXT
    END,
    jsonb_build_object('tables_with_rls', COUNT(*))
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
  AND c.relrowsecurity = true;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION get_lead_context_for_ai IS 'Get complete lead context for AI processing';
COMMENT ON FUNCTION verify_tenant_isolation IS 'Verify user has access to organization';
COMMENT ON VIEW organization_usage_summary IS 'Usage summary for billing and limits';
COMMENT ON TABLE audit_logs IS 'Audit trail for compliance and debugging';
COMMENT ON FUNCTION log_audit_event IS 'Log audit events for compliance';
COMMENT ON FUNCTION system_health_check IS 'Check system health and configuration';

-- Final success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 009 completed successfully!';
  RAISE NOTICE 'All tables, indexes, and RLS policies are in place.';
  RAISE NOTICE 'Run SELECT * FROM system_health_check() to verify setup.';
END $$;-- ========================================
-- Migration: 001_extensions_and_enums.sql
-- Generated: 2025-08-25T16:05:13.401Z
-- ========================================

-- Migration 001: Enable Extensions and Create ENUMs
-- Purpose: Set up foundational database extensions and types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite GIN indexes

-- Create ENUM types for consistent status values
CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active', 
  'past_due',
  'canceled',
  'paused'
);

CREATE TYPE subscription_plan AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise',
  'custom'
);

CREATE TYPE crm_type AS ENUM (
  'fub',           -- Follow Up Boss
  'lofty',         -- Lofty (formerly Chime)
  'pipedrive',     -- Pipedrive
  'salesforce',    -- Salesforce
  'hubspot',       -- HubSpot
  'kvcore',        -- KvCore
  'liondesk',      -- LionDesk
  'custom'         -- Custom CRM
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

CREATE TYPE conversation_status AS ENUM (
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE qualification_status AS ENUM (
  'not_qualified',
  'partially_qualified',
  'qualified',
  'disqualified'
);

CREATE TYPE ai_provider AS ENUM (
  'claude',
  'openai',
  'gemini',
  'custom'
);

-- Create a simple test to verify extensions are enabled
CREATE OR REPLACE FUNCTION test_extensions()
RETURNS TABLE (
  extension_name text,
  is_installed boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ext.extname::text,
    true as is_installed
  FROM pg_extension ext
  WHERE ext.extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin')
  ORDER BY ext.extname;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TYPE subscription_status IS 'Subscription status for tenant billing';
COMMENT ON TYPE subscription_plan IS 'Available subscription tiers';
COMMENT ON TYPE crm_type IS 'Supported CRM integrations';
COMMENT ON TYPE message_direction IS 'SMS message direction';
COMMENT ON TYPE sender_type IS 'Type of message sender';
COMMENT ON TYPE conversation_status IS 'Conversation lifecycle status';
COMMENT ON TYPE qualification_status IS 'Lead qualification status';
COMMENT ON TYPE ai_provider IS 'AI service providers for text generation';

-- ========================================
-- End of Migration
-- ========================================