-- Migration: Complete Infrastructure Setup
-- Creates missing tables for extraction, qualification, usage tracking, and CRM integrations

-- 1. Create extraction_logs table for storing Claude extraction results
CREATE TABLE IF NOT EXISTS extraction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Extraction data
  extraction_data JSONB NOT NULL DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  extraction_type VARCHAR(50) DEFAULT 'conversation',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  ai_model VARCHAR(50) DEFAULT 'claude-3-haiku',
  token_usage INTEGER,
  
  -- Indexes
  CONSTRAINT unique_tenant_lead_extraction UNIQUE(tenant_id, lead_id, extraction_type)
);

CREATE INDEX idx_extraction_logs_tenant_lead ON extraction_logs(tenant_id, lead_id);
CREATE INDEX idx_extraction_logs_created ON extraction_logs(created_at DESC);

-- 2. Create lead_qualifications table for tracking qualification status
CREATE TABLE IF NOT EXISTS lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Qualification tracking
  timeline_to_move TEXT,
  timeline_confidence DECIMAL(3,2),
  
  working_with_agent BOOLEAN,
  agent_status_confidence DECIMAL(3,2),
  
  financing_status TEXT,
  financing_confidence DECIMAL(3,2),
  
  property_preferences JSONB DEFAULT '{}',
  
  -- Qualification status
  is_qualified BOOLEAN DEFAULT FALSE,
  qualification_reason TEXT,
  qualified_at TIMESTAMPTZ,
  
  -- Interest tracking
  wants_phone_call BOOLEAN DEFAULT FALSE,
  wants_showing BOOLEAN DEFAULT FALSE,
  wants_more_info BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_analyzed_at TIMESTAMPTZ,
  
  -- Unique constraint
  CONSTRAINT unique_tenant_lead_qualification UNIQUE(tenant_id, lead_id)
);

CREATE INDEX idx_lead_qualifications_tenant_lead ON lead_qualifications(tenant_id, lead_id);
CREATE INDEX idx_lead_qualifications_qualified ON lead_qualifications(is_qualified, qualified_at);

-- 3. Create usage_metrics table for billing and limits
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_type VARCHAR(50) NOT NULL, -- 'sms_sent', 'ai_response', 'lead_created', etc.
  quantity INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  
  -- Billing period
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CHECK (metric_type IN ('sms_sent', 'sms_received', 'ai_response', 'lead_created', 'lead_synced', 'extraction_performed'))
);

CREATE INDEX idx_usage_metrics_tenant_period ON usage_metrics(tenant_id, billing_period_start, billing_period_end);
CREATE INDEX idx_usage_metrics_type ON usage_metrics(tenant_id, metric_type, created_at DESC);

-- 4. Create crm_integrations table for storing CRM credentials
CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- CRM details
  crm_type crm_type NOT NULL DEFAULT 'fub',
  is_active BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT TRUE,
  
  -- Credentials (encrypted in production)
  api_credentials JSONB NOT NULL DEFAULT '{}',
  -- For FUB: { api_key, x_system, x_system_key, user_id }
  -- For Lofty: { api_key, team_id, etc. }
  -- For Pipedrive: { api_token, company_domain }
  
  -- Configuration
  sync_config JSONB DEFAULT '{
    "sync_interval_minutes": 15,
    "sync_enabled": true,
    "sync_direction": "bidirectional",
    "field_mappings": {}
  }',
  
  -- Webhook config
  webhook_config JSONB DEFAULT '{}',
  
  -- Last sync tracking
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_error TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_tenant_crm_type UNIQUE(tenant_id, crm_type),
  CONSTRAINT one_primary_per_tenant UNIQUE(tenant_id, is_primary) WHERE is_primary = TRUE
);

CREATE INDEX idx_crm_integrations_tenant ON crm_integrations(tenant_id, is_active);
CREATE INDEX idx_crm_integrations_sync ON crm_integrations(is_active, last_sync_at);

-- 5. Add missing columns to existing tables if they don't exist
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_type crm_type DEFAULT 'fub';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_api_config JSONB DEFAULT '{}';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS fub_lead_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lofty_lead_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipedrive_lead_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesforce_lead_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hubspot_lead_id VARCHAR(255);

-- Create indexes for CRM-specific lead IDs
CREATE INDEX IF NOT EXISTS idx_leads_fub_id ON leads(tenant_id, fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lofty_id ON leads(tenant_id, lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pipedrive_id ON leads(tenant_id, pipedrive_lead_id) WHERE pipedrive_lead_id IS NOT NULL;

-- 6. Create function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric_type VARCHAR(50)
) RETURNS TABLE (
  current_usage BIGINT,
  plan_limit INTEGER,
  is_over_limit BOOLEAN,
  overage_amount BIGINT
) AS $$
DECLARE
  v_current_usage BIGINT;
  v_plan_limit INTEGER;
  v_subscription_plan VARCHAR(50);
BEGIN
  -- Get tenant's subscription plan
  SELECT subscription_plan INTO v_subscription_plan
  FROM tenants
  WHERE id = p_tenant_id;
  
  -- Get current month's usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_usage
  FROM usage_metrics
  WHERE tenant_id = p_tenant_id
    AND metric_type = p_metric_type
    AND billing_period_start = DATE_TRUNC('month', CURRENT_DATE);
  
  -- Set limits based on plan
  v_plan_limit := CASE
    WHEN v_subscription_plan = 'starter' THEN 
      CASE p_metric_type
        WHEN 'sms_sent' THEN 1000
        WHEN 'lead_created' THEN 500
        WHEN 'ai_response' THEN 2000
        ELSE 10000
      END
    WHEN v_subscription_plan = 'professional' THEN
      CASE p_metric_type
        WHEN 'sms_sent' THEN 5000
        WHEN 'lead_created' THEN 2000
        WHEN 'ai_response' THEN 10000
        ELSE 50000
      END
    WHEN v_subscription_plan = 'enterprise' THEN
      NULL -- No limits for enterprise
    ELSE 100 -- Trial or unknown
  END;
  
  RETURN QUERY SELECT
    v_current_usage,
    v_plan_limit,
    v_plan_limit IS NOT NULL AND v_current_usage > v_plan_limit,
    GREATEST(0, v_current_usage - COALESCE(v_plan_limit, v_current_usage));
END;
$$ LANGUAGE plpgsql;

-- 7. Create RLS policies for new tables
ALTER TABLE extraction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

-- RLS for extraction_logs
CREATE POLICY "Tenants can view own extraction logs" ON extraction_logs
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = extraction_logs.tenant_id AND user_id = auth.uid()
  ));

CREATE POLICY "Tenants can insert own extraction logs" ON extraction_logs
  FOR INSERT WITH CHECK (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = extraction_logs.tenant_id AND user_id = auth.uid()
  ));

CREATE POLICY "Tenants can update own extraction logs" ON extraction_logs
  FOR UPDATE USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = extraction_logs.tenant_id AND user_id = auth.uid()
  ));

-- RLS for lead_qualifications
CREATE POLICY "Tenants can view own lead qualifications" ON lead_qualifications
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = lead_qualifications.tenant_id AND user_id = auth.uid()
  ));

CREATE POLICY "Tenants can manage own lead qualifications" ON lead_qualifications
  FOR ALL USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = lead_qualifications.tenant_id AND user_id = auth.uid()
  ));

-- RLS for usage_metrics
CREATE POLICY "Tenants can view own usage" ON usage_metrics
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = usage_metrics.tenant_id AND user_id = auth.uid()
  ));

CREATE POLICY "System can insert usage metrics" ON usage_metrics
  FOR INSERT WITH CHECK (true); -- Only backend service account can insert

-- RLS for crm_integrations
CREATE POLICY "Tenants can view own CRM integrations" ON crm_integrations
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = crm_integrations.tenant_id AND user_id = auth.uid()
  ));

CREATE POLICY "Tenants can manage own CRM integrations" ON crm_integrations
  FOR ALL USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = crm_integrations.tenant_id AND user_id = auth.uid()
  ));

-- 8. Create helper functions for common queries
CREATE OR REPLACE FUNCTION get_tenant_crm_config(p_tenant_id UUID)
RETURNS TABLE (
  crm_type crm_type,
  api_credentials JSONB,
  sync_config JSONB,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.crm_type,
    ci.api_credentials,
    ci.sync_config,
    ci.is_active
  FROM crm_integrations ci
  WHERE ci.tenant_id = p_tenant_id
    AND ci.is_primary = TRUE
    AND ci.is_active = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_extraction_logs_updated_at BEFORE UPDATE ON extraction_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_qualifications_updated_at BEFORE UPDATE ON lead_qualifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_integrations_updated_at BEFORE UPDATE ON crm_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration complete
COMMENT ON TABLE extraction_logs IS 'Stores AI extraction results from conversations';
COMMENT ON TABLE lead_qualifications IS 'Tracks lead qualification status and responses';
COMMENT ON TABLE usage_metrics IS 'Tracks usage for billing and rate limiting';
COMMENT ON TABLE crm_integrations IS 'Stores CRM credentials and sync configuration per tenant';