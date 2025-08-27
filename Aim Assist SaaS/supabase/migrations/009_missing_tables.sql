-- Migration 009: Missing Tables for Tag Polling and CRM Integration
-- Creates tables that were defined but not yet created
-- All use organization_id for consistency

-- 1. Tag Polling Configuration Table
CREATE TABLE IF NOT EXISTS tag_polling_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization link
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Tag configuration
  tag_name VARCHAR(100) NOT NULL,
  interval_minutes INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  
  -- Processing options
  process_immediately BOOLEAN DEFAULT true,
  enable_ai BOOLEAN DEFAULT true,
  send_auto_text BOOLEAN DEFAULT true,
  
  -- Business hours settings
  business_hours_only BOOLEAN DEFAULT false,
  start_hour INTEGER DEFAULT 9,
  end_hour INTEGER DEFAULT 20,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Tracking
  last_poll_time TIMESTAMPTZ,
  last_lead_count INTEGER DEFAULT 0,
  total_leads_processed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique tag per organization
  CONSTRAINT unique_org_tag UNIQUE(organization_id, tag_name)
);

-- 2. CRM Integrations Table
CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization link
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- CRM type and credentials
  crm_type VARCHAR(50) NOT NULL CHECK (crm_type IN ('fub', 'lofty', 'pipedrive', 'salesforce', 'hubspot')),
  credentials JSONB NOT NULL DEFAULT '{}', -- Encrypted in production
  settings JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Sync configuration
  sync_interval_minutes INTEGER DEFAULT 30,
  auto_sync_enabled BOOLEAN DEFAULT true,
  
  -- Field mappings (CRM field -> our field)
  field_mappings JSONB DEFAULT '{
    "first_name": "firstName",
    "last_name": "lastName",
    "email": "email",
    "phone": "phone",
    "tags": "tags"
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one CRM integration per org (for now)
  CONSTRAINT unique_org_crm UNIQUE(organization_id)
);

-- 3. Auto-Text Rules Table
CREATE TABLE IF NOT EXISTS autotext_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization link
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Rule configuration
  rule_name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('new_lead', 'tag_added', 'time_based', 'lead_action')),
  trigger_value JSONB NOT NULL, -- e.g., {"tag": "AIM_ASSIST"} or {"hours_after_creation": 1}
  
  -- Message configuration
  message_template TEXT NOT NULL,
  personalization_enabled BOOLEAN DEFAULT true,
  ai_enhancement_enabled BOOLEAN DEFAULT true,
  
  -- Timing
  delay_minutes INTEGER DEFAULT 0,
  business_hours_only BOOLEAN DEFAULT true,
  
  -- Conditions
  conditions JSONB DEFAULT '[]', -- Array of conditions that must be met
  
  -- Status and tracking
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 50,
  times_triggered INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique rule names per org
  CONSTRAINT unique_org_rule_name UNIQUE(organization_id, rule_name)
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tag_polling_active ON tag_polling_configs(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tag_polling_tag ON tag_polling_configs(tag_name, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crm_integrations_org ON crm_integrations(organization_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_autotext_rules_org ON autotext_rules(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_autotext_rules_trigger ON autotext_rules(trigger_type, is_active) WHERE is_active = true;

-- 5. Updated timestamp triggers
CREATE TRIGGER update_tag_polling_updated_at 
  BEFORE UPDATE ON tag_polling_configs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_integrations_updated_at 
  BEFORE UPDATE ON crm_integrations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_autotext_rules_updated_at 
  BEFORE UPDATE ON autotext_rules 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Drop the empty tenants table to avoid confusion
DROP TABLE IF EXISTS tenants CASCADE;

-- 7. Add helpful comments
COMMENT ON TABLE tag_polling_configs IS 'Configures automated polling for specific CRM tags like AIM_ASSIST';
COMMENT ON TABLE crm_integrations IS 'Stores CRM credentials and sync settings per organization';
COMMENT ON TABLE autotext_rules IS 'Defines automated text message rules and triggers';

COMMENT ON COLUMN tag_polling_configs.tag_name IS 'The CRM tag to monitor (e.g., AIM_ASSIST)';
COMMENT ON COLUMN crm_integrations.credentials IS 'Encrypted CRM API credentials';
COMMENT ON COLUMN autotext_rules.trigger_value IS 'JSON configuration for the trigger (varies by trigger_type)';