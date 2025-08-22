-- Migration: Add Lead Qualification Tracking
-- Tracks qualification status and fields for each lead

-- Create lead_qualifications table
CREATE TABLE IF NOT EXISTS lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Qualification fields
  timeline VARCHAR(255),
  budget VARCHAR(255),
  financing VARCHAR(255),
  agent_status VARCHAR(255),
  location TEXT,
  
  -- Qualification metrics
  qualification_score INTEGER DEFAULT 0,
  is_qualified BOOLEAN DEFAULT false,
  escalation_reason VARCHAR(255),
  
  -- Interest indicators
  phone_interest BOOLEAN DEFAULT false,
  scheduling_interest BOOLEAN DEFAULT false,
  urgent_need BOOLEAN DEFAULT false,
  high_value BOOLEAN DEFAULT false,
  
  -- Timestamps
  qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one qualification per lead per tenant
  UNIQUE(tenant_id, lead_id)
);

-- Create indexes
CREATE INDEX idx_qualifications_tenant_id ON lead_qualifications(tenant_id);
CREATE INDEX idx_qualifications_lead_id ON lead_qualifications(lead_id);
CREATE INDEX idx_qualifications_qualified ON lead_qualifications(is_qualified);
CREATE INDEX idx_qualifications_score ON lead_qualifications(qualification_score);

-- Enable RLS
ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view own qualifications" ON lead_qualifications
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY "Tenants can insert own qualifications" ON lead_qualifications
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY "Tenants can update own qualifications" ON lead_qualifications
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Grant permissions
GRANT ALL ON lead_qualifications TO authenticated;
GRANT ALL ON lead_qualifications TO service_role;

-- Add qualification fields to leads table if not exist
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_pause_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_qualification_check TIMESTAMPTZ;