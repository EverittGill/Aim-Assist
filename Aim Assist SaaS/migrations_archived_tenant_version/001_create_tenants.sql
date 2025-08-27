-- This table stores each company using Aim Assist
-- Each tenant is completely isolated from others
-- Includes subscription and settings for the company

CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  industry VARCHAR(100) DEFAULT 'real_estate',
  
  -- Subscription info
  subscription_status VARCHAR(50) DEFAULT 'trial',
  subscription_plan VARCHAR(50) DEFAULT 'starter',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_ends_at TIMESTAMPTZ,
  
  -- Stripe info
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255),
  
  -- Settings stored as JSONB for flexibility
  settings JSONB DEFAULT '{
    "auto_text_enabled": false,
    "auto_text_sources": [],
    "auto_text_delay_minutes": 5,
    "business_hours_enabled": false,
    "business_hours": {"start": "09:00", "end": "17:00"},
    "timezone": "America/New_York",
    "ai_provider": "gemini",
    "ai_temperature": 0.7,
    "sms_limit_monthly": 1000,
    "lead_limit_monthly": 500
  }'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure subdomain is lowercase and URL-safe
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$')
);

-- Create indexes for common queries
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE INDEX idx_tenants_active ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own tenant
CREATE POLICY tenant_isolation ON tenants
  FOR ALL
  USING (id = current_setting('app.current_tenant_id')::UUID);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at 
  BEFORE UPDATE ON tenants 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE tenants IS 'Multi-tenant organizations using Aim Assist platform';
COMMENT ON COLUMN tenants.subdomain IS 'Unique subdomain for tenant access (e.g., company-name.aim-assist.com)';
COMMENT ON COLUMN tenants.settings IS 'Flexible JSON storage for tenant-specific configuration';