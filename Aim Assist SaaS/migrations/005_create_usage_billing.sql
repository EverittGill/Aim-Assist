-- Usage tracking and billing related tables

-- Usage metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_type VARCHAR(50) NOT NULL, -- sms_sent, sms_received, lead_created, ai_generation
  quantity INTEGER DEFAULT 1,
  
  -- Associated resources
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  -- Billing period
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  
  -- Cost tracking
  unit_cost DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing history table
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Invoice details
  stripe_invoice_id VARCHAR(255) UNIQUE,
  invoice_number VARCHAR(50),
  
  -- Billing period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Amounts
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  
  -- Payment
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed, cancelled
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  
  -- Line items stored as JSONB
  line_items JSONB NOT NULL,
  -- Example: [
  --   {"description": "Starter Plan", "amount": 99.00},
  --   {"description": "Additional SMS (500)", "amount": 25.00}
  -- ]
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE
);

-- Plan limits table
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Plan details
  plan_name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  
  -- Limits
  max_leads_monthly INTEGER,
  max_sms_monthly INTEGER,
  max_users INTEGER,
  max_phone_numbers INTEGER,
  max_crm_integrations INTEGER DEFAULT 1,
  
  -- Features
  features JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "auto_text": true,
  --   "ai_providers": ["gemini", "claude", "gpt4"],
  --   "custom_templates": true,
  --   "api_access": false,
  --   "white_label": false
  -- }
  
  -- Pricing
  monthly_price DECIMAL(10,2) NOT NULL,
  annual_price DECIMAL(10,2),
  overage_sms_price DECIMAL(10,4) DEFAULT 0.05,
  overage_lead_price DECIMAL(10,2) DEFAULT 0.50,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plan_limits (plan_name, display_name, max_leads_monthly, max_sms_monthly, max_users, max_phone_numbers, monthly_price, annual_price, features) VALUES
('starter', 'Starter', 100, 500, 2, 1, 99.00, 990.00, 
  '{"auto_text": true, "ai_providers": ["gemini"], "custom_templates": true, "api_access": false}'::jsonb),
('growth', 'Growth', 500, 2500, 5, 3, 299.00, 2990.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude"], "custom_templates": true, "api_access": true}'::jsonb),
('scale', 'Scale', 2000, 10000, 20, 10, 799.00, 7990.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude", "gpt4"], "custom_templates": true, "api_access": true, "white_label": true}'::jsonb),
('enterprise', 'Enterprise', NULL, NULL, NULL, NULL, 0.00, 0.00, 
  '{"auto_text": true, "ai_providers": ["gemini", "claude", "gpt4"], "custom_templates": true, "api_access": true, "white_label": true, "custom_contract": true}'::jsonb);

-- Notifications table for system alerts
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification details
  type VARCHAR(50) NOT NULL, -- usage_limit, payment_failed, lead_qualified, system_update
  severity VARCHAR(20) DEFAULT 'info', -- info, warning, error, critical
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Action
  action_url TEXT,
  action_label VARCHAR(100),
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_usage_metrics_tenant ON usage_metrics(tenant_id, billing_period_start);
CREATE INDEX idx_usage_metrics_type ON usage_metrics(tenant_id, metric_type);
CREATE INDEX idx_billing_history_tenant ON billing_history(tenant_id);
CREATE INDEX idx_billing_history_status ON billing_history(status);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id, is_read);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Enable RLS
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY usage_metrics_tenant_isolation ON usage_metrics
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY billing_history_tenant_isolation ON billing_history
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric_type VARCHAR,
  p_period_start DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)
)
RETURNS TABLE(
  current_usage INTEGER,
  plan_limit INTEGER,
  is_over_limit BOOLEAN,
  overage_amount INTEGER
) AS $$
DECLARE
  v_plan VARCHAR;
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  -- Get tenant's plan
  SELECT subscription_plan INTO v_plan
  FROM tenants WHERE id = p_tenant_id;
  
  -- Get plan limit
  CASE p_metric_type
    WHEN 'sms_sent' THEN
      SELECT max_sms_monthly INTO v_limit
      FROM plan_limits WHERE plan_name = v_plan;
    WHEN 'lead_created' THEN
      SELECT max_leads_monthly INTO v_limit
      FROM plan_limits WHERE plan_name = v_plan;
    ELSE
      v_limit := NULL;
  END CASE;
  
  -- Get current usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_usage
  FROM usage_metrics
  WHERE tenant_id = p_tenant_id
    AND metric_type = p_metric_type
    AND billing_period_start = p_period_start;
  
  -- Return results
  RETURN QUERY SELECT
    v_usage AS current_usage,
    v_limit AS plan_limit,
    CASE WHEN v_limit IS NULL THEN FALSE ELSE v_usage > v_limit END AS is_over_limit,
    CASE WHEN v_limit IS NULL THEN 0 ELSE GREATEST(0, v_usage - v_limit) END AS overage_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers
CREATE TRIGGER update_plan_limits_updated_at 
  BEFORE UPDATE ON plan_limits 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE usage_metrics IS 'Tracks usage for billing and limit enforcement';
COMMENT ON TABLE billing_history IS 'Invoice and payment history';
COMMENT ON TABLE plan_limits IS 'Subscription plan definitions and limits';
COMMENT ON TABLE notifications IS 'System notifications for users';
COMMENT ON FUNCTION check_usage_limit IS 'Check if tenant has exceeded plan limits';