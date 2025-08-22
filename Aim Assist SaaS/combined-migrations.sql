-- ========================================
-- Aim Assist SaaS - Complete Database Setup
-- Generated: 2025-08-17T15:46:38.548Z
-- ========================================
-- 
-- Run this entire script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qjuajqqchqxjxntofdoz/sql/new
--
-- This will create all tables with proper multi-tenant isolation
-- ========================================


-- ========================================
-- Migration 1: 001_create_tenants.sql
-- ========================================

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


-- ========================================
-- Migration 2: 002_create_users.sql
-- ========================================

-- Users belong to tenants (companies)
-- Linked to Supabase Auth for authentication
-- Roles determine what users can do in the system

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_id UUID UNIQUE NOT NULL, -- Links to Supabase auth.users table
  
  -- User info
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  
  -- Role-based access control
  role VARCHAR(50) DEFAULT 'member',
  -- Roles: owner, admin, member, viewer
  
  -- Permissions stored as array for flexibility
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure unique email per tenant
  CONSTRAINT unique_email_per_tenant UNIQUE(tenant_id, email)
);

-- Create indexes for common queries
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see users in their tenant
CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- RLS Policy: Users can update their own profile
CREATE POLICY users_self_update ON users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create user on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- For initial development, create a default tenant if needed
  -- In production, tenant should be created during signup flow
  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    -- Insert user with specified tenant
    INSERT INTO public.users (auth_id, email, tenant_id, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      (NEW.raw_user_meta_data->>'tenant_id')::UUID,
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user record on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add comments for documentation
COMMENT ON TABLE users IS 'Users belonging to tenant organizations';
COMMENT ON COLUMN users.auth_id IS 'References Supabase auth.users.id for authentication';
COMMENT ON COLUMN users.role IS 'User role within tenant: owner, admin, member, viewer';
COMMENT ON COLUMN users.permissions IS 'Additional granular permissions beyond role';


-- ========================================
-- Migration 3: 003_create_crm_integrations.sql
-- ========================================

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


-- ========================================
-- Migration 4: 004_create_conversations_messages.sql
-- ========================================

-- Conversations and messages tables for SMS communication tracking

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Conversation status
  status VARCHAR(50) DEFAULT 'active', -- active, paused, completed, archived
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Metrics
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_ai_message_at TIMESTAMPTZ,
  last_human_message_at TIMESTAMPTZ,
  
  -- Qualification tracking
  qualification_status VARCHAR(50) DEFAULT 'not_qualified',
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message details
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  sender_type VARCHAR(20) NOT NULL, -- lead, ai, human
  content TEXT NOT NULL,
  
  -- SMS details
  phone_from VARCHAR(20),
  phone_to VARCHAR(20),
  twilio_sid VARCHAR(100),
  twilio_status VARCHAR(50),
  
  -- AI details (if AI generated)
  ai_provider VARCHAR(50), -- claude, gemini, gpt4
  ai_model VARCHAR(100),
  ai_temperature DECIMAL(3,2),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

-- Templates table for prompt management
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Template details
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- initial_outreach, conversation_reply, follow_up
  content TEXT NOT NULL,
  variables TEXT[], -- List of supported variables
  
  -- Usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique name per tenant
  CONSTRAINT unique_template_name_per_tenant UNIQUE(tenant_id, name)
);

-- Phone numbers table for Twilio numbers
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Phone details
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  friendly_name VARCHAR(100),
  
  -- Twilio details
  twilio_sid VARCHAR(100),
  twilio_subaccount_sid VARCHAR(100),
  capabilities JSONB DEFAULT '{"sms": true, "voice": false, "mms": false}'::jsonb,
  
  -- Usage
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  monthly_cost DECIMAL(10,2),
  
  -- Metadata
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  
  -- One primary number per tenant
  CONSTRAINT one_primary_phone_per_tenant UNIQUE(tenant_id, is_primary) WHERE is_primary = true
);

-- Auto-text rules table
CREATE TABLE IF NOT EXISTS auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule configuration
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  -- Conditions (all must match)
  conditions JSONB NOT NULL,
  -- Example: {
  --   "source": ["website", "zillow"],
  --   "tags": {"contains": ["hot"]},
  --   "time_since_created": {"max_minutes": 5}
  -- }
  
  -- Actions
  template_id UUID REFERENCES templates(id),
  delay_minutes INTEGER DEFAULT 1,
  
  -- Business hours
  respect_business_hours BOOLEAN DEFAULT true,
  
  -- Metrics
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(tenant_id, status);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_type ON templates(tenant_id, type);

CREATE INDEX idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX idx_auto_text_rules_tenant ON auto_text_rules(tenant_id, is_active);

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY messages_tenant_isolation ON messages
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY templates_tenant_isolation ON templates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY phone_numbers_tenant_isolation ON phone_numbers
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY auto_text_rules_tenant_isolation ON auto_text_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at 
  BEFORE UPDATE ON templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_text_rules_updated_at 
  BEFORE UPDATE ON auto_text_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE conversations IS 'SMS conversation threads with leads';
COMMENT ON TABLE messages IS 'Individual SMS messages within conversations';
COMMENT ON TABLE templates IS 'Customizable prompt templates for AI responses';
COMMENT ON TABLE phone_numbers IS 'Twilio phone numbers owned by tenants';
COMMENT ON TABLE auto_text_rules IS 'Automated text message rules based on lead attributes';


-- ========================================
-- Migration 5: 005_create_usage_billing.sql
-- ========================================

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


-- ========================================
-- Migration 6: 006_add_qualification_tracking.sql
-- ========================================

-- Supplemental migration for qualification tracking
-- Adds fields identified from Eugenia bot analysis
-- Tracks lead qualification progress in detail

-- Add qualification tracking fields to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS timeline_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS timeline_response TEXT,
ADD COLUMN IF NOT EXISTS agent_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_response TEXT,
ADD COLUMN IF NOT EXISTS financing_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS financing_response TEXT,
ADD COLUMN IF NOT EXISTS phone_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduling_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS high_engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_complete_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS agent_notified_at TIMESTAMPTZ;

-- Add custom field mappings to CRM integrations
ALTER TABLE crm_integrations 
ADD COLUMN IF NOT EXISTS custom_field_mappings JSONB DEFAULT '{
  "ai_status_field": "customEugeniaTalkingStatus",
  "conversation_link_field": "customAimAssist", 
  "pause_until_field": "customEugeniaPausedUntil",
  "qualification_status_field": "customQualificationStatus"
}'::jsonb;

-- Add notification settings to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_after_messages INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS notification_pause_hours INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notification_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "sms_enabled": true,
  "email_enabled": false,
  "webhook_enabled": false,
  "qualified_lead_alert": true,
  "escalation_alert": true,
  "opt_out_alert": true
}'::jsonb;

-- Add template enhancements
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 160,
ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS system_prompt TEXT,
ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;

-- Add message tracking fields
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS qualification_detected JSONB,
ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false;

-- Create qualification_events table for tracking
CREATE TABLE IF NOT EXISTS qualification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- timeline_answered, agent_status_answered, etc.
  event_data JSONB,
  detected_from_message UUID REFERENCES messages(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT unique_event_per_conversation UNIQUE(conversation_id, event_type)
);

-- Create notification_queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- qualified_lead, escalation, opt_out
  priority INTEGER DEFAULT 5,
  channel VARCHAR(20) NOT NULL, -- sms, email, webhook
  recipient VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_qualification_events_tenant ON qualification_events(tenant_id);
CREATE INDEX idx_qualification_events_conversation ON qualification_events(conversation_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status, scheduled_for);
CREATE INDEX idx_notification_queue_tenant ON notification_queue(tenant_id);

-- Enable RLS on new tables
ALTER TABLE qualification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY qualification_events_tenant_isolation ON qualification_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY notification_queue_tenant_isolation ON notification_queue
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers for updated_at on notification_queue
CREATE TRIGGER update_notification_queue_updated_at 
  BEFORE UPDATE ON notification_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE qualification_events IS 'Tracks qualification milestones detected in conversations';
COMMENT ON TABLE notification_queue IS 'Queue for SMS, email, and webhook notifications to agents';
COMMENT ON COLUMN conversations.timeline_status IS 'Whether lead has answered timeline question';
COMMENT ON COLUMN conversations.agent_status IS 'Whether lead has indicated agent status';
COMMENT ON COLUMN conversations.financing_status IS 'Whether lead has provided financing info';
COMMENT ON COLUMN conversations.high_engagement_score IS 'Engagement score based on message count and qualification answers';
COMMENT ON COLUMN tenants.notification_phone IS 'Primary phone number for agent notifications';
COMMENT ON COLUMN tenants.notification_preferences IS 'JSON configuration for notification channels and types';

