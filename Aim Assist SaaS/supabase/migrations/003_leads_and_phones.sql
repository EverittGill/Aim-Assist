-- Migration 003: Leads with Separate Phone Table
-- Optimized for fast phone lookups and CRM flexibility

-- Leads table (simplified with direct CRM IDs)
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  
  -- Direct CRM IDs (we know these, no need for JSONB)
  fub_lead_id VARCHAR(100),
  lofty_lead_id VARCHAR(100),
  
  -- Core fields
  source VARCHAR(100),
  stage VARCHAR(50),
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- AI status
  ai_enabled BOOLEAN DEFAULT true,
  ai_paused_until TIMESTAMPTZ,
  ai_pause_reason TEXT,
  
  -- Activity tracking
  message_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  
  -- Extension point for unknown data
  custom_data JSONB DEFAULT '{}'::jsonb,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints for CRM IDs (unique per org)
  CONSTRAINT unique_fub_lead UNIQUE(organization_id, fub_lead_id),
  CONSTRAINT unique_lofty_lead UNIQUE(organization_id, lofty_lead_id)
);

-- Separate phone table for proper indexing
CREATE TABLE lead_phones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Phone data
  phone VARCHAR(20) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL, -- Always E.164 for searching
  is_primary BOOLEAN DEFAULT false,
  phone_type VARCHAR(20) DEFAULT 'mobile', -- mobile, home, work
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate phones per org
  CONSTRAINT unique_phone_per_org UNIQUE(organization_id, phone_normalized)
);

-- Critical indexes for performance
CREATE INDEX idx_leads_org ON leads(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_fub_id ON leads(organization_id, fub_lead_id) WHERE fub_lead_id IS NOT NULL;
CREATE INDEX idx_leads_lofty_id ON leads(organization_id, lofty_lead_id) WHERE lofty_lead_id IS NOT NULL;
CREATE INDEX idx_leads_email ON leads(organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_activity ON leads(organization_id, last_activity_at DESC) WHERE deleted_at IS NULL;

-- Phone lookup indexes (CRITICAL for performance)
CREATE INDEX idx_lead_phones_normalized ON lead_phones(organization_id, phone_normalized);
CREATE INDEX idx_lead_phones_lead ON lead_phones(lead_id);

-- Function to find lead by phone (uses normalized index)
CREATE OR REPLACE FUNCTION find_lead_by_phone(
  p_org_id UUID,
  p_phone TEXT
) RETURNS TABLE (
  lead_id UUID,
  lead_name TEXT,
  ai_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id as lead_id,
    CONCAT(l.first_name, ' ', l.last_name) as lead_name,
    l.ai_enabled
  FROM lead_phones lp
  JOIN leads l ON l.id = lp.lead_id
  WHERE lp.organization_id = p_org_id
  AND lp.phone_normalized = normalize_phone(p_phone)
  AND l.deleted_at IS NULL
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to add phone to lead
CREATE OR REPLACE FUNCTION add_lead_phone(
  p_lead_id UUID,
  p_phone TEXT,
  p_is_primary BOOLEAN DEFAULT false
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  v_normalized TEXT;
BEGIN
  -- Get organization
  SELECT organization_id INTO v_org_id
  FROM leads WHERE id = p_lead_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Normalize phone
  v_normalized := normalize_phone(p_phone);
  
  -- Insert or update
  INSERT INTO lead_phones (lead_id, organization_id, phone, phone_normalized, is_primary)
  VALUES (p_lead_id, v_org_id, p_phone, v_normalized, p_is_primary)
  ON CONFLICT (organization_id, phone_normalized) 
  DO UPDATE SET is_primary = EXCLUDED.is_primary;
  
  -- If setting as primary, unset others
  IF p_is_primary THEN
    UPDATE lead_phones 
    SET is_primary = false 
    WHERE lead_id = p_lead_id 
    AND phone_normalized != v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at 
  BEFORE UPDATE ON leads 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE leads IS 'Lead records with direct CRM ID storage';
COMMENT ON TABLE lead_phones IS 'Separate phone storage for fast lookups';
COMMENT ON COLUMN lead_phones.phone_normalized IS 'E.164 format for consistent searching';
COMMENT ON FUNCTION find_lead_by_phone IS 'Fast phone lookup using normalized index';