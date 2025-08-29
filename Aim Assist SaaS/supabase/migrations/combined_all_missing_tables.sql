-- Combined migration for all missing tables
-- Run this in Supabase SQL Editor to create all missing tables at once

-- ============================================
-- 0. Helper Functions
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SYNC_HISTORY Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_count INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'partial')),
  CHECK (sync_type IN ('full_sync', 'incremental', 'webhook', 'manual', 'scheduled', 'tag_poll'))
);

CREATE INDEX IF NOT EXISTS idx_sync_history_organization ON sync_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history(status);
CREATE INDEX IF NOT EXISTS idx_sync_history_created ON sync_history(created_at DESC);

-- ============================================
-- 2. USAGE_METRICS Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'count',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  cost DECIMAL(10, 4) DEFAULT 0,
  metadata JSONB,
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (quantity >= 0),
  CHECK (cost >= 0),
  CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_organization ON usage_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(organization_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_type ON usage_metrics(metric_type);

-- ============================================
-- 3. EXTRACTION_LOGS Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.extraction_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  extraction_type VARCHAR(50) NOT NULL,
  extracted_data JSONB NOT NULL,
  confidence_score DECIMAL(3, 2) DEFAULT 0,
  method VARCHAR(50) NOT NULL,
  source_text TEXT,
  prompt_used TEXT,
  model_version VARCHAR(100),
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  auto_applied BOOLEAN DEFAULT false,
  user_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CHECK (status IN ('success', 'partial', 'failed', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_organization ON extraction_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_lead ON extraction_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_type ON extraction_logs(extraction_type);

-- ============================================
-- 4. CRM_INTEGRATIONS Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  api_url TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  field_mappings JSONB DEFAULT '{}',
  sync_settings JSONB DEFAULT '{}',
  capabilities JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  last_error TEXT,
  sync_frequency_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, crm_type, name),
  CHECK (sync_frequency_minutes >= 1 AND sync_frequency_minutes <= 1440)
);

CREATE INDEX IF NOT EXISTS idx_crm_integrations_organization ON crm_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_active ON crm_integrations(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_primary_crm_per_org ON crm_integrations(organization_id) WHERE is_primary = true;

-- ============================================
-- 5. AUDIT_LOGS Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id),
  actor_type VARCHAR(50) DEFAULT 'user',
  ip_address INET,
  user_agent TEXT,
  request_id UUID,
  session_id UUID,
  old_values JSONB,
  new_values JSONB,
  changes JSONB,
  details JSONB,
  metadata JSONB,
  tags TEXT[],
  status VARCHAR(50) DEFAULT 'success',
  error_code VARCHAR(100),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (status IN ('success', 'failed', 'pending', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- 6. Add Triggers for updated_at
-- ============================================

-- Add triggers only if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sync_history_updated_at') THEN
    CREATE TRIGGER update_sync_history_updated_at
      BEFORE UPDATE ON sync_history
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crm_integrations_updated_at') THEN
    CREATE TRIGGER update_crm_integrations_updated_at
      BEFORE UPDATE ON crm_integrations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- 7. Add Table Comments
-- ============================================

COMMENT ON TABLE sync_history IS 'Tracks all CRM synchronization operations for audit and debugging';
COMMENT ON TABLE usage_metrics IS 'Tracks all usage metrics for billing and analytics';
COMMENT ON TABLE extraction_logs IS 'Logs all AI data extraction attempts from conversations';
COMMENT ON TABLE crm_integrations IS 'Stores CRM integration configurations and credentials for each organization';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system events and changes';

-- ============================================
-- Success Message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'All missing tables created successfully!';
END $$;