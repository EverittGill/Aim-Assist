-- Migration: Tag Polling System
-- Adds tables for tag-based lead polling and tracking

-- 1. Create tag_poll_history table
CREATE TABLE IF NOT EXISTS tag_poll_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  
  -- Polling metrics
  last_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  poll_count INTEGER DEFAULT 0,
  leads_found INTEGER DEFAULT 0,
  leads_processed INTEGER DEFAULT 0,
  leads_skipped INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for tenant+tag combination
  CONSTRAINT unique_tenant_tag UNIQUE(tenant_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_tag_poll_history_tenant ON tag_poll_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tag_poll_history_last_poll ON tag_poll_history(last_poll_at DESC);

-- 2. Create tag_polling_configs table
CREATE TABLE IF NOT EXISTS tag_polling_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  
  -- Polling configuration
  interval_minutes INTEGER DEFAULT 3,
  process_immediately BOOLEAN DEFAULT TRUE,
  enable_ai BOOLEAN DEFAULT TRUE,
  send_auto_text BOOLEAN DEFAULT TRUE,
  
  -- Business hours configuration
  business_hours_only BOOLEAN DEFAULT TRUE,
  start_hour INTEGER DEFAULT 9,
  end_hour INTEGER DEFAULT 20,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Job tracking
  job_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint
  CONSTRAINT unique_tenant_tag_config UNIQUE(tenant_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_tag_polling_configs_tenant ON tag_polling_configs(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tag_polling_configs_tag ON tag_polling_configs(tag_name);

-- 3. Create auto_text_rules table if it doesn't exist
CREATE TABLE IF NOT EXISTS auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule configuration
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 10,
  
  -- Trigger configuration
  trigger_type VARCHAR(50) DEFAULT 'new_lead',
  trigger_conditions JSONB DEFAULT '{}',
  
  -- Timing configuration
  delay_minutes INTEGER DEFAULT 1,
  send_window_start TIME DEFAULT '09:00:00',
  send_window_end TIME DEFAULT '20:00:00',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Lead filters
  lead_sources TEXT[] DEFAULT '{}',
  lead_tags TEXT[] DEFAULT '{}',
  excluded_tags TEXT[] DEFAULT '{"DO_NOT_TEXT", "VIP", "MANUAL_ONLY"}',
  
  -- Message configuration
  message_template TEXT NOT NULL,
  
  -- Limits
  max_sends_per_lead INTEGER DEFAULT 1,
  max_sends_per_day INTEGER,
  stop_on_response BOOLEAN DEFAULT TRUE,
  
  -- Statistics
  sends_count INTEGER DEFAULT 0,
  responses_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (priority >= 0 AND priority <= 100),
  CHECK (delay_minutes >= 0),
  CHECK (max_sends_per_lead > 0),
  CHECK (trigger_type IN ('new_lead', 'tag_added', 'status_change', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_auto_text_rules_tenant ON auto_text_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_auto_text_rules_priority ON auto_text_rules(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_auto_text_rules_tags ON auto_text_rules USING GIN (lead_tags);

-- 4. Create auto_text_applications table for tracking rule applications
CREATE TABLE IF NOT EXISTS auto_text_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES auto_text_rules(id) ON DELETE CASCADE,
  
  -- Application details
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'scheduled',
  error_message TEXT,
  
  -- Message details
  message_sent TEXT,
  phone_number VARCHAR(20),
  
  -- Response tracking
  response_received BOOLEAN DEFAULT FALSE,
  response_received_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes and constraints
  CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_applications_tenant_status ON auto_text_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_lead ON auto_text_applications(lead_id);
CREATE INDEX IF NOT EXISTS idx_applications_rule ON auto_text_applications(rule_id);
CREATE INDEX IF NOT EXISTS idx_applications_scheduled ON auto_text_applications(scheduled_at) WHERE status = 'scheduled';

-- 5. Add tag polling queue to queue configuration
INSERT INTO queue_configs (name, processor, concurrency, default_options, is_active)
VALUES (
  'tag-poll',
  'tagPollProcessor',
  2,
  '{
    "attempts": 3,
    "backoff": {
      "type": "exponential",
      "delay": 5000
    },
    "removeOnComplete": 100,
    "removeOnFail": 50
  }',
  true
) ON CONFLICT (name) DO NOTHING;

-- 6. Create RLS policies
ALTER TABLE tag_poll_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_polling_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_applications ENABLE ROW LEVEL SECURITY;

-- RLS for tag_poll_history
DROP POLICY IF EXISTS "Tenants can view own tag poll history" ON tag_poll_history;
CREATE POLICY "Tenants can view own tag poll history" ON tag_poll_history
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = tag_poll_history.tenant_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Tenants can manage own tag poll history" ON tag_poll_history;
CREATE POLICY "Tenants can manage own tag poll history" ON tag_poll_history
  FOR ALL USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = tag_poll_history.tenant_id AND user_id = auth.uid()
  ));

-- RLS for tag_polling_configs
DROP POLICY IF EXISTS "Tenants can view own tag polling configs" ON tag_polling_configs;
CREATE POLICY "Tenants can view own tag polling configs" ON tag_polling_configs
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = tag_polling_configs.tenant_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Tenants can manage own tag polling configs" ON tag_polling_configs;
CREATE POLICY "Tenants can manage own tag polling configs" ON tag_polling_configs
  FOR ALL USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = tag_polling_configs.tenant_id AND user_id = auth.uid()
  ));

-- RLS for auto_text_rules
DROP POLICY IF EXISTS "Tenants can view own auto text rules" ON auto_text_rules;
CREATE POLICY "Tenants can view own auto text rules" ON auto_text_rules
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = auto_text_rules.tenant_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Tenants can manage own auto text rules" ON auto_text_rules;
CREATE POLICY "Tenants can manage own auto text rules" ON auto_text_rules
  FOR ALL USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = auto_text_rules.tenant_id AND user_id = auth.uid()
  ));

-- RLS for auto_text_applications
DROP POLICY IF EXISTS "Tenants can view own auto text applications" ON auto_text_applications;
CREATE POLICY "Tenants can view own auto text applications" ON auto_text_applications
  FOR SELECT USING (tenant_id = auth.uid() OR EXISTS (
    SELECT 1 FROM tenants WHERE id = auto_text_applications.tenant_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "System can manage auto text applications" ON auto_text_applications;
CREATE POLICY "System can manage auto text applications" ON auto_text_applications
  FOR ALL USING (true); -- Service account needs full access

-- 7. Create helper functions
CREATE OR REPLACE FUNCTION get_tag_poll_stats(
  p_tenant_id UUID,
  p_tag_name VARCHAR(100)
) RETURNS TABLE (
  tag_name VARCHAR(100),
  last_poll_at TIMESTAMPTZ,
  poll_count INTEGER,
  total_leads_found BIGINT,
  total_leads_processed BIGINT,
  average_leads_per_poll NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tph.tag_name,
    tph.last_poll_at,
    tph.poll_count,
    SUM(tph.leads_found) AS total_leads_found,
    SUM(tph.leads_processed) AS total_leads_processed,
    CASE 
      WHEN tph.poll_count > 0 
      THEN ROUND(SUM(tph.leads_processed)::NUMERIC / tph.poll_count, 2)
      ELSE 0
    END AS average_leads_per_poll
  FROM tag_poll_history tph
  WHERE tph.tenant_id = p_tenant_id
    AND tph.tag_name = p_tag_name
  GROUP BY tph.tag_name, tph.last_poll_at, tph.poll_count;
END;
$$ LANGUAGE plpgsql;

-- 8. Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tag_poll_history_updated_at ON tag_poll_history;
CREATE TRIGGER update_tag_poll_history_updated_at BEFORE UPDATE ON tag_poll_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tag_polling_configs_updated_at ON tag_polling_configs;
CREATE TRIGGER update_tag_polling_configs_updated_at BEFORE UPDATE ON tag_polling_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auto_text_rules_updated_at ON auto_text_rules;
CREATE TRIGGER update_auto_text_rules_updated_at BEFORE UPDATE ON auto_text_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration complete
COMMENT ON TABLE tag_poll_history IS 'Tracks polling history for specific tags per tenant';
COMMENT ON TABLE tag_polling_configs IS 'Stores tag polling configuration and schedules';
COMMENT ON TABLE auto_text_rules IS 'Defines rules for automated text message sending';
COMMENT ON TABLE auto_text_applications IS 'Tracks applications of auto-text rules to leads';