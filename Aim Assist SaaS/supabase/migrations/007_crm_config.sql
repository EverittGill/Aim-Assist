-- Migration 007: CRM Configuration
-- Simple CRM config with field mappings in JSON

-- CRM configurations table
CREATE TABLE crm_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- CRM type and status
  crm_type VARCHAR(20) NOT NULL, -- fub, lofty, kvcore, etc.
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT true,
  
  -- Encrypted credentials
  credentials_encrypted TEXT NOT NULL,
  
  -- Non-sensitive config
  config JSONB DEFAULT '{}'::jsonb,
  -- For FUB: {"x_system": "...", "x_system_key": "...", "user_id": "..."}
  -- For Lofty: {"team_id": "...", "api_version": "v2"}
  
  -- Field mappings (simple JSON, not separate table)
  field_mappings JSONB DEFAULT '{}'::jsonb,
  -- Example:
  -- {
  --   "first_name": "firstName",
  --   "last_name": "lastName",
  --   "phone": "phones[0].value",
  --   "email": "emails[0].value",
  --   "custom_ai_status": "customEugeniaTalkingStatus"
  -- }
  
  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  sync_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_crm_per_org UNIQUE(organization_id, crm_type),
  CONSTRAINT one_primary_crm UNIQUE(organization_id, is_primary) WHERE is_primary = true
);

-- Webhook logs table
CREATE TABLE webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Source
  source VARCHAR(50), -- fub, lofty, twilio, stripe
  event_type VARCHAR(100),
  
  -- Request data
  headers JSONB,
  payload JSONB,
  
  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default field mappings (for reference/initialization)
CREATE TABLE crm_field_defaults (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  crm_type VARCHAR(20) NOT NULL,
  field_mappings JSONB NOT NULL,
  
  CONSTRAINT unique_crm_defaults UNIQUE(crm_type)
);

-- Insert default mappings
INSERT INTO crm_field_defaults (crm_type, field_mappings) VALUES
('fub', '{
  "first_name": "firstName",
  "last_name": "lastName",
  "email": "emails[0].value",
  "phone": "phones[0].value",
  "source": "source",
  "tags": "tags",
  "external_id": "id",
  "custom_ai_status": "customEugeniaTalkingStatus",
  "custom_ai_link": "customAimAssist",
  "custom_ai_paused": "customEugeniaPausedUntil"
}'::jsonb),
('lofty', '{
  "first_name": "contact.first_name",
  "last_name": "contact.last_name",
  "email": "contact.email",
  "phone": "contact.phone_number",
  "source": "lead_source",
  "tags": "tags",
  "external_id": "id"
}'::jsonb);

-- Indexes
CREATE INDEX idx_crm_configs_org ON crm_configs(organization_id, is_active);
CREATE INDEX idx_webhook_logs_org ON webhook_logs(organization_id, created_at DESC);
CREATE INDEX idx_webhook_logs_unprocessed ON webhook_logs(processed, created_at) WHERE processed = false;

-- Function to get CRM field value
CREATE OR REPLACE FUNCTION get_crm_field_value(
  p_crm_data JSONB,
  p_field_path TEXT
) RETURNS TEXT AS $$
DECLARE
  v_parts TEXT[];
  v_current JSONB;
  v_part TEXT;
  v_index INTEGER;
BEGIN
  -- Handle simple field names
  IF p_field_path NOT LIKE '%.%' AND p_field_path NOT LIKE '%[%' THEN
    RETURN p_crm_data->>p_field_path;
  END IF;
  
  -- Split path by dots
  v_parts := string_to_array(p_field_path, '.');
  v_current := p_crm_data;
  
  FOREACH v_part IN ARRAY v_parts LOOP
    -- Check for array notation like "phones[0]"
    IF v_part LIKE '%[%]' THEN
      -- Extract field name and index
      v_part := substring(v_part from '^[^[]+');
      v_index := substring(p_field_path from '\[(\d+)\]')::INTEGER;
      
      -- Navigate to array element
      v_current := v_current->v_part->v_index;
    ELSE
      -- Simple field navigation
      v_current := v_current->v_part;
    END IF;
    
    IF v_current IS NULL THEN
      RETURN NULL;
    END IF;
  END LOOP;
  
  -- Return as text
  IF jsonb_typeof(v_current) = 'string' THEN
    RETURN v_current #>> '{}';
  ELSE
    RETURN v_current::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to map CRM data to our schema
CREATE OR REPLACE FUNCTION map_crm_to_lead(
  p_org_id UUID,
  p_crm_type VARCHAR(20),
  p_crm_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_mappings JSONB;
  v_result JSONB := '{}'::jsonb;
  v_field RECORD;
BEGIN
  -- Get field mappings for this CRM
  SELECT field_mappings INTO v_mappings
  FROM crm_configs
  WHERE organization_id = p_org_id
  AND crm_type = p_crm_type
  AND is_active = true
  LIMIT 1;
  
  -- If no custom mappings, use defaults
  IF v_mappings IS NULL THEN
    SELECT field_mappings INTO v_mappings
    FROM crm_field_defaults
    WHERE crm_type = p_crm_type;
  END IF;
  
  -- Map each field
  FOR v_field IN SELECT * FROM jsonb_each_text(v_mappings) LOOP
    v_result := jsonb_set(
      v_result,
      ARRAY[v_field.key],
      to_jsonb(get_crm_field_value(p_crm_data, v_field.value))
    );
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for updated_at
CREATE TRIGGER update_crm_configs_updated_at 
  BEFORE UPDATE ON crm_configs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE crm_configs IS 'CRM integration configurations';
COMMENT ON TABLE webhook_logs IS 'Incoming webhook log for debugging';
COMMENT ON TABLE crm_field_defaults IS 'Default field mappings for each CRM type';
COMMENT ON FUNCTION get_crm_field_value IS 'Extract value from CRM data using path notation';
COMMENT ON FUNCTION map_crm_to_lead IS 'Map CRM data to our lead schema';