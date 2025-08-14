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