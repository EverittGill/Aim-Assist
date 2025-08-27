-- Migration 006: Auto-text Rules and Usage Tracking
-- Auto-text automation and append-only usage tracking

-- Auto-text rules table
CREATE TABLE auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Rule details
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher number = higher priority
  
  -- Trigger conditions (flexible JSON)
  trigger_conditions JSONB NOT NULL,
  -- Examples:
  -- {"source": ["Zillow", "Realtor.com"], "tags": ["hot", "buyer"]}
  -- {"hours_since_created": {"max": 1}, "no_conversation": true}
  -- {"message_count": {"equals": 0}, "business_hours": true}
  
  -- Action to take
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  delay_minutes INTEGER DEFAULT 5,
  
  -- Time restrictions
  active_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "21:00"},
    "tuesday": {"start": "09:00", "end": "21:00"},
    "wednesday": {"start": "09:00", "end": "21:00"},
    "thursday": {"start": "09:00", "end": "21:00"},
    "friday": {"start": "09:00", "end": "21:00"},
    "saturday": {"start": "10:00", "end": "18:00"},
    "sunday": {"start": "10:00", "end": "18:00"}
  }'::jsonb,
  respect_timezone BOOLEAN DEFAULT true,
  
  -- Metrics
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage events table (append-only for performance)
CREATE TABLE usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- sms_sent, sms_received, lead_created, ai_response, etc.
  quantity INTEGER DEFAULT 1,
  
  -- Related entities (optional)
  lead_id UUID,
  conversation_id UUID,
  message_id UUID,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp (critical for billing periods)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage summary materialized view (refresh hourly)
CREATE MATERIALIZED VIEW usage_summary AS
SELECT 
  organization_id,
  date_trunc('month', created_at) as month,
  event_type,
  SUM(quantity) as total_quantity,
  COUNT(*) as event_count
FROM usage_events
GROUP BY organization_id, date_trunc('month', created_at), event_type;

-- Indexes
CREATE INDEX idx_auto_text_rules_org ON auto_text_rules(organization_id, is_active);
CREATE INDEX idx_auto_text_rules_priority ON auto_text_rules(priority DESC) WHERE is_active = true;

-- Critical index for usage queries
CREATE INDEX idx_usage_events_org_month ON usage_events(organization_id, created_at DESC);
CREATE INDEX idx_usage_events_type ON usage_events(organization_id, event_type, created_at DESC);

-- Index for materialized view
CREATE UNIQUE INDEX idx_usage_summary_unique ON usage_summary(organization_id, month, event_type);

-- Function to check if rule matches lead
CREATE OR REPLACE FUNCTION check_autotext_rule_match(
  p_rule_id UUID,
  p_lead_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rule RECORD;
  v_lead RECORD;
  v_conditions JSONB;
BEGIN
  -- Get rule
  SELECT * INTO v_rule
  FROM auto_text_rules
  WHERE id = p_rule_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get lead
  SELECT 
    l.*,
    COUNT(m.id) as message_count,
    EXTRACT(EPOCH FROM (NOW() - l.created_at))/3600 as hours_since_created
  INTO v_lead
  FROM leads l
  LEFT JOIN conversations c ON c.lead_id = l.id AND c.status = 'active'
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE l.id = p_lead_id
  GROUP BY l.id;
  
  v_conditions := v_rule.trigger_conditions;
  
  -- Check source condition
  IF v_conditions ? 'source' THEN
    IF NOT (v_lead.source = ANY(SELECT jsonb_array_elements_text(v_conditions->'source'))) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check tags condition
  IF v_conditions ? 'tags' THEN
    IF NOT (v_lead.tags && (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(v_conditions->'tags') elem)) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check message count
  IF v_conditions ? 'message_count' THEN
    IF v_conditions->'message_count' ? 'equals' THEN
      IF v_lead.message_count != (v_conditions->'message_count'->>'equals')::INTEGER THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  -- Check hours since created
  IF v_conditions->'hours_since_created' ? 'max' THEN
    IF v_lead.hours_since_created > (v_conditions->'hours_since_created'->>'max')::FLOAT THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to record usage event
CREATE OR REPLACE FUNCTION record_usage(
  p_org_id UUID,
  p_event_type VARCHAR(50),
  p_quantity INTEGER DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_events (organization_id, event_type, quantity, metadata)
  VALUES (p_org_id, p_event_type, p_quantity, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly usage
CREATE OR REPLACE FUNCTION get_monthly_usage(
  p_org_id UUID,
  p_month DATE DEFAULT date_trunc('month', CURRENT_DATE)
) RETURNS TABLE (
  event_type VARCHAR(50),
  total_quantity BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ue.event_type,
    SUM(ue.quantity)::BIGINT as total_quantity
  FROM usage_events ue
  WHERE ue.organization_id = p_org_id
  AND ue.created_at >= p_month
  AND ue.created_at < p_month + INTERVAL '1 month'
  GROUP BY ue.event_type;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_org_id UUID,
  p_event_type VARCHAR(50),
  p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_settings JSONB;
  v_current_usage BIGINT;
  v_limit INTEGER;
  v_limit_key TEXT;
BEGIN
  -- Get org settings
  SELECT settings INTO v_settings
  FROM organizations
  WHERE id = p_org_id;
  
  -- Map event type to limit key
  v_limit_key := CASE p_event_type
    WHEN 'sms_sent' THEN 'sms_limit_monthly'
    WHEN 'lead_created' THEN 'lead_limit_monthly'
    ELSE NULL
  END;
  
  IF v_limit_key IS NULL THEN
    RETURN true; -- No limit for this event type
  END IF;
  
  -- Get limit from settings
  v_limit := COALESCE((v_settings->>v_limit_key)::INTEGER, 999999);
  
  -- Get current usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_usage
  FROM usage_events
  WHERE organization_id = p_org_id
  AND event_type = p_event_type
  AND created_at >= date_trunc('month', CURRENT_DATE);
  
  -- Check if increment would exceed limit
  RETURN (v_current_usage + p_increment) <= v_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for auto-text rules
CREATE TRIGGER update_auto_text_rules_updated_at 
  BEFORE UPDATE ON auto_text_rules 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE auto_text_rules IS 'Automated text message rules based on triggers';
COMMENT ON TABLE usage_events IS 'Append-only usage tracking for billing';
COMMENT ON MATERIALIZED VIEW usage_summary IS 'Pre-aggregated usage data (refresh hourly)';
COMMENT ON FUNCTION check_autotext_rule_match IS 'Check if a rule matches a lead';
COMMENT ON FUNCTION record_usage IS 'Record a usage event (append-only)';
COMMENT ON FUNCTION check_usage_limit IS 'Check if action would exceed monthly limit';