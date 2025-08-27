-- Migration 002: Organizations and Agents
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
COMMENT ON COLUMN agents.notification_phone IS 'Where to send qualified lead alerts';