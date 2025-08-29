-- Create usage_metrics table for tracking usage and billing
CREATE TABLE IF NOT EXISTS public.usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL, -- 'sms_sent', 'ai_message', 'lead_processed', 'api_call', etc.
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'count', -- 'count', 'minutes', 'tokens', etc.
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'daily', 'hourly'
  cost DECIMAL(10, 4) DEFAULT 0, -- Cost in dollars
  metadata JSONB, -- Additional details (phone numbers, lead IDs, etc.)
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (quantity >= 0),
  CHECK (cost >= 0),
  CHECK (period_end > period_start)
);

-- Create indexes for performance
CREATE INDEX idx_usage_metrics_organization ON usage_metrics(organization_id);
CREATE INDEX idx_usage_metrics_period ON usage_metrics(organization_id, period_start, period_end);
CREATE INDEX idx_usage_metrics_type ON usage_metrics(metric_type);
CREATE INDEX idx_usage_metrics_created ON usage_metrics(created_at DESC);
CREATE INDEX idx_usage_metrics_billable ON usage_metrics(is_billable) WHERE is_billable = true;

-- Enable Row Level Security
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations can only see their own usage metrics
CREATE POLICY "usage_metrics_isolation" ON usage_metrics
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Create a materialized view for monthly summaries (optional, for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_metrics_monthly AS
SELECT 
  organization_id,
  metric_type,
  DATE_TRUNC('month', period_start) as month,
  SUM(quantity) as total_quantity,
  SUM(cost) as total_cost,
  COUNT(*) as event_count,
  MAX(created_at) as last_updated
FROM usage_metrics
WHERE is_billable = true
GROUP BY organization_id, metric_type, DATE_TRUNC('month', period_start);

-- Create index on materialized view
CREATE INDEX idx_usage_metrics_monthly_org ON usage_metrics_monthly(organization_id, month);

-- Add comment
COMMENT ON TABLE usage_metrics IS 'Tracks all usage metrics for billing and analytics';
COMMENT ON MATERIALIZED VIEW usage_metrics_monthly IS 'Monthly aggregated usage for faster billing queries';