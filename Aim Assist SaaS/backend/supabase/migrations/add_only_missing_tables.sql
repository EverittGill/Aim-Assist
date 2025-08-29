-- Add only the missing tables (skip existing ones)
-- Based on your screenshot, crm_integrations already exists

-- ============================================
-- 0. Helper Functions (if not exists)
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
-- 1. SYNC_HISTORY Table (NEW)
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
-- 2. USAGE_METRICS Table (NEW)
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
-- 3. EXTRACTION_LOGS Table (NEW)
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
  verified_by UUID REFERENCES agents(id),  -- Changed from users to agents
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
-- 4. AUDIT_LOGS Table (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES agents(id),  -- Changed from users to agents
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
-- 5. Add Missing Columns to Existing Tables
-- ============================================

-- Add missing columns to crm_integrations if needed
DO $$
BEGIN
  -- Add is_primary column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'crm_integrations' 
                 AND column_name = 'is_primary') THEN
    ALTER TABLE crm_integrations ADD COLUMN is_primary BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added is_primary column to crm_integrations';
  END IF;
  
  -- Add sync_frequency_minutes if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'crm_integrations' 
                 AND column_name = 'sync_frequency_minutes') THEN
    ALTER TABLE crm_integrations ADD COLUMN sync_frequency_minutes INTEGER DEFAULT 15;
    RAISE NOTICE 'Added sync_frequency_minutes column to crm_integrations';
  END IF;
  
  -- Add capabilities if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'crm_integrations' 
                 AND column_name = 'capabilities') THEN
    ALTER TABLE crm_integrations ADD COLUMN capabilities JSONB DEFAULT '{}';
    RAISE NOTICE 'Added capabilities column to crm_integrations';
  END IF;
  
  -- Add field_mappings if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'crm_integrations' 
                 AND column_name = 'field_mappings') THEN
    ALTER TABLE crm_integrations ADD COLUMN field_mappings JSONB DEFAULT '{}';
    RAISE NOTICE 'Added field_mappings column to crm_integrations';
  END IF;
  
  -- Add sync_settings if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'crm_integrations' 
                 AND column_name = 'sync_settings') THEN
    ALTER TABLE crm_integrations ADD COLUMN sync_settings JSONB DEFAULT '{}';
    RAISE NOTICE 'Added sync_settings column to crm_integrations';
  END IF;
END $$;

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
END $$;

-- ============================================
-- 7. Add Table Comments
-- ============================================

COMMENT ON TABLE sync_history IS 'Tracks all CRM synchronization operations for audit and debugging';
COMMENT ON TABLE usage_metrics IS 'Tracks all usage metrics for billing and analytics';
COMMENT ON TABLE extraction_logs IS 'Logs all AI data extraction attempts from conversations';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system events and changes';

-- ============================================
-- Success Message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Created tables: sync_history, usage_metrics, extraction_logs, audit_logs';
  RAISE NOTICE 'Updated existing table: crm_integrations (added missing columns)';
END $$;