-- Create crm_integrations table for CRM configuration and credentials
CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_type VARCHAR(50) NOT NULL, -- 'followupboss', 'lofty', 'kvcore', 'liondesk', etc.
  name VARCHAR(255) NOT NULL, -- User-friendly name for this integration
  api_key TEXT, -- Encrypted API key
  api_secret TEXT, -- Encrypted API secret if needed
  api_url TEXT, -- Base API URL if custom
  webhook_url TEXT, -- Webhook endpoint for this integration
  webhook_secret TEXT, -- Webhook signature secret
  config JSONB NOT NULL DEFAULT '{}', -- Additional configuration
  field_mappings JSONB DEFAULT '{}', -- Custom field mappings
  sync_settings JSONB DEFAULT '{}', -- Sync frequency, filters, etc.
  capabilities JSONB DEFAULT '{}', -- What this CRM supports
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false, -- Primary CRM for this organization
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  last_error TEXT,
  sync_frequency_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, crm_type, name),
  CHECK (sync_frequency_minutes >= 1 AND sync_frequency_minutes <= 1440)
);

-- Create indexes for performance
CREATE INDEX idx_crm_integrations_organization ON crm_integrations(organization_id);
CREATE INDEX idx_crm_integrations_active ON crm_integrations(is_active) WHERE is_active = true;
CREATE INDEX idx_crm_integrations_primary ON crm_integrations(organization_id, is_primary) WHERE is_primary = true;
CREATE INDEX idx_crm_integrations_type ON crm_integrations(crm_type);
CREATE INDEX idx_crm_integrations_sync ON crm_integrations(last_sync_at);

-- Enable Row Level Security
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations can only see their own CRM integrations
CREATE POLICY "crm_integrations_isolation" ON crm_integrations
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Ensure only one primary CRM per organization
CREATE UNIQUE INDEX idx_one_primary_crm_per_org 
  ON crm_integrations(organization_id) 
  WHERE is_primary = true;

-- Add updated_at trigger
CREATE TRIGGER update_crm_integrations_updated_at
  BEFORE UPDATE ON crm_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Default CRM capabilities template
COMMENT ON COLUMN crm_integrations.capabilities IS 'JSON object with boolean flags: {
  "supports_sms": true,
  "supports_webhooks": true,
  "supports_custom_fields": true,
  "supports_tags": true,
  "supports_bulk_sync": true,
  "supports_real_time": false,
  "max_api_calls_per_minute": 60
}';

-- Default sync settings template  
COMMENT ON COLUMN crm_integrations.sync_settings IS 'JSON object with sync configuration: {
  "sync_leads": true,
  "sync_messages": true,
  "sync_tags": true,
  "lead_filters": {},
  "exclude_tags": [],
  "include_tags": []
}';

-- Add table comment
COMMENT ON TABLE crm_integrations IS 'Stores CRM integration configurations and credentials for each organization';