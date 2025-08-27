-- Migration: Add CRM Type Support for Multi-CRM Architecture
-- Purpose: Support multiple CRM systems (FUB, Lofty, Pipedrive, etc.)
-- Date: 2025-01-23

-- Add CRM type enum
CREATE TYPE crm_type AS ENUM ('fub', 'lofty', 'pipedrive', 'salesforce', 'hubspot');

-- Update tenants table to track which CRM they use
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS crm_type crm_type DEFAULT 'fub',
ADD COLUMN IF NOT EXISTS crm_api_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS crm_user_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 5;

-- Update leads table to store CRM-specific IDs
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS fub_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS lofty_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS pipedrive_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS salesforce_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS hubspot_lead_id VARCHAR(255);

-- Create indexes for fast CRM ID lookups
CREATE INDEX IF NOT EXISTS idx_leads_fub_id ON leads(fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lofty_id ON leads(lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pipedrive_id ON leads(pipedrive_lead_id) WHERE pipedrive_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesforce_id ON leads(salesforce_lead_id) WHERE salesforce_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_hubspot_id ON leads(hubspot_lead_id) WHERE hubspot_lead_id IS NOT NULL;

-- Add composite index for tenant + CRM ID lookups
CREATE INDEX IF NOT EXISTS idx_leads_tenant_fub ON leads(tenant_id, fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant_lofty ON leads(tenant_id, lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;

-- Create sync log table to track synchronization history
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
  crm_type crm_type NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed'
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for sync log queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant ON sync_logs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status, started_at DESC);

-- Create CRM field mappings table for flexible field mapping
CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  crm_type crm_type NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'lead', 'contact', 'activity', etc.
  crm_field VARCHAR(255) NOT NULL,
  supabase_field VARCHAR(255) NOT NULL,
  field_type VARCHAR(50), -- 'string', 'number', 'date', 'boolean', 'json'
  is_required BOOLEAN DEFAULT false,
  transform_function TEXT, -- Optional JS/SQL function for data transformation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, crm_type, entity_type, crm_field)
);

-- Add missing tables if they don't exist
CREATE TABLE IF NOT EXISTS lead_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  qualification_score INTEGER DEFAULT 0,
  timeline_status VARCHAR(50),
  budget_status VARCHAR(50),
  financing_status VARCHAR(50),
  agent_status VARCHAR(50),
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, lead_id)
);

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  ai_responses INTEGER DEFAULT 0,
  extraction_jobs INTEGER DEFAULT 0,
  sync_operations INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, metric_date)
);

-- Add extraction confidence tracking
CREATE TABLE IF NOT EXISTS extraction_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  extraction_log_id UUID REFERENCES extraction_logs(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  extracted_value TEXT,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_extraction_confidence_lead (lead_id, created_at DESC)
);

-- Migrate existing data (map crm_lead_id to fub_lead_id for existing records)
UPDATE leads 
SET fub_lead_id = crm_lead_id 
WHERE crm_lead_id IS NOT NULL 
  AND fub_lead_id IS NULL
  AND tenant_id IN (SELECT id FROM tenants WHERE crm_type = 'fub' OR crm_type IS NULL);

-- Set default CRM type for existing tenants to 'fub'
UPDATE tenants 
SET crm_type = 'fub' 
WHERE crm_type IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN tenants.crm_type IS 'Type of CRM system the tenant uses';
COMMENT ON COLUMN tenants.crm_api_config IS 'CRM-specific API configuration (keys, endpoints, etc.)';
COMMENT ON COLUMN tenants.crm_user_id IS 'Tenant''s user ID in their CRM system';
COMMENT ON COLUMN tenants.last_sync_at IS 'Last successful sync timestamp';
COMMENT ON COLUMN tenants.sync_enabled IS 'Whether automatic sync is enabled';
COMMENT ON COLUMN tenants.sync_interval_minutes IS 'How often to sync data from CRM';

COMMENT ON COLUMN leads.fub_lead_id IS 'Lead ID in Follow Up Boss CRM';
COMMENT ON COLUMN leads.lofty_lead_id IS 'Lead ID in Lofty CRM';
COMMENT ON COLUMN leads.pipedrive_lead_id IS 'Lead ID in Pipedrive CRM';

COMMENT ON TABLE sync_logs IS 'Track CRM synchronization history and status';
COMMENT ON TABLE crm_field_mappings IS 'Map CRM fields to Supabase fields for each tenant';
COMMENT ON TABLE lead_qualifications IS 'Track lead qualification status and scores';
COMMENT ON TABLE usage_metrics IS 'Track usage metrics for billing and analytics';