-- Migration 010: Complete FUB Data Sync
-- Extends leads table to store ALL available FUB fields for rich AI context

-- Add columns for complete FUB data storage
-- Contact arrays (complete data)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS addresses JSONB DEFAULT '[]';

-- Lead management fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_details JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS price_min INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS price_max INTEGER;

-- Assignment and collaboration
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_lender_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_lender_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS collaborators JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS team_leaders JSONB DEFAULT '[]';

-- Activity tracking (comprehensive)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_communication TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS delayed BOOLEAN DEFAULT false;

-- Email activity
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_received_email TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sent_email TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_email TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS emails_received INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS emails_sent INTEGER DEFAULT 0;

-- Call activity
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_incoming_call TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outgoing_call TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS calls_incoming INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS calls_outgoing INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS calls_duration INTEGER DEFAULT 0;

-- Text activity
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_received_text TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sent_text TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_text TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS texts_received INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS texts_sent INTEGER DEFAULT 0;

-- Property activity
ALTER TABLE leads ADD COLUMN IF NOT EXISTS properties_viewed INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS properties_saved INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pages_viewed INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_visits INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_idx_visit TIMESTAMPTZ;

-- Deal information
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_status VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_stage VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_close_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_price INTEGER;

-- Tasks and timeframe
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_task TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_task_has_time BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_task_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeframe_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeframe_status VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeframe_date_range VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeframe_updated TIMESTAMPTZ;

-- Social and profile data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS picture JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS social_data JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS background TEXT;

-- Relationships
ALTER TABLE leads ADD COLUMN IF NOT EXISTS relationships JSONB DEFAULT '[]';

-- FUB system fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_via VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_by_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_flow_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_pond_id INTEGER;

-- Complete raw FUB data (for reference and future fields)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fub_data JSONB;

-- Sync metadata
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_fub_sync TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fub_sync_version INTEGER DEFAULT 1;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_user_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_price_range ON leads(price_min, price_max) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_fub_sync ON leads(last_fub_sync) WHERE deleted_at IS NULL;

-- Add GIN index for JSONB fields for efficient querying
CREATE INDEX IF NOT EXISTS idx_leads_phones_gin ON leads USING GIN (phones);
CREATE INDEX IF NOT EXISTS idx_leads_emails_gin ON leads USING GIN (emails);
CREATE INDEX IF NOT EXISTS idx_leads_tags_gin ON leads USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_leads_custom_data_gin ON leads USING GIN (custom_data);
CREATE INDEX IF NOT EXISTS idx_leads_fub_data_gin ON leads USING GIN (fub_data);

-- Create a view for simplified lead queries with primary contact info
CREATE OR REPLACE VIEW leads_with_primary_contact AS
SELECT 
  l.*,
  -- Extract primary phone
  COALESCE(
    (phones->0->>'value')::text,
    phone
  ) AS primary_phone,
  -- Extract primary email  
  COALESCE(
    (emails->0->>'value')::text,
    email
  ) AS primary_email,
  -- Extract primary address
  (addresses->0) AS primary_address,
  -- Calculate engagement score
  CASE 
    WHEN texts_received > 0 OR calls_incoming > 0 OR emails_received > 0 THEN 'engaged'
    WHEN texts_sent > 0 OR calls_outgoing > 0 OR emails_sent > 0 THEN 'contacted'
    ELSE 'new'
  END AS engagement_status,
  -- Calculate days since last activity
  EXTRACT(DAYS FROM NOW() - last_activity) AS days_inactive
FROM leads l
WHERE deleted_at IS NULL;

-- Create function to extract custom fields from FUB data
CREATE OR REPLACE FUNCTION extract_fub_custom_fields(fub_data JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}';
  key TEXT;
  value JSONB;
BEGIN
  -- Extract all fields starting with 'custom'
  FOR key, value IN SELECT * FROM jsonb_each(fub_data)
  LOOP
    IF key LIKE 'custom%' THEN
      result := result || jsonb_build_object(
        substring(key from 7), -- Remove 'custom' prefix
        value
      );
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to build rich AI context from lead data
CREATE OR REPLACE FUNCTION build_ai_context(lead_id UUID)
RETURNS JSONB AS $$
DECLARE
  lead_record RECORD;
  context JSONB;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = lead_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  context := jsonb_build_object(
    'personal', jsonb_build_object(
      'name', COALESCE(lead_record.first_name || ' ' || lead_record.last_name, 'Friend'),
      'firstName', lead_record.first_name,
      'phones', lead_record.phones,
      'emails', lead_record.emails,
      'addresses', lead_record.addresses
    ),
    'search_criteria', jsonb_build_object(
      'priceMin', lead_record.price_min,
      'priceMax', lead_record.price_max,
      'propertyTypes', COALESCE(lead_record.custom_data->>'propertyTypes', '[]')::jsonb,
      'areas', COALESCE(lead_record.custom_data->>'areasOfInterest', '[]')::jsonb,
      'timeline', lead_record.custom_data->>'timeline',
      'motivation', lead_record.custom_data->>'motivation'
    ),
    'engagement', jsonb_build_object(
      'stage', lead_record.stage,
      'temperature', lead_record.temperature,
      'score', lead_record.score,
      'lastActivity', lead_record.last_activity,
      'daysInactive', EXTRACT(DAYS FROM NOW() - lead_record.last_activity),
      'textsReceived', lead_record.texts_received,
      'textsSent', lead_record.texts_sent,
      'propertiesViewed', lead_record.properties_viewed,
      'propertiesSaved', lead_record.properties_saved
    ),
    'assignment', jsonb_build_object(
      'agent', lead_record.assigned_user_name,
      'lender', lead_record.assigned_lender_name
    ),
    'source', jsonb_build_object(
      'source', lead_record.source,
      'sourceUrl', lead_record.source_url,
      'tags', lead_record.tags
    ),
    'activity_summary', jsonb_build_object(
      'totalInteractions', (
        lead_record.texts_received + lead_record.texts_sent + 
        lead_record.calls_incoming + lead_record.calls_outgoing + 
        lead_record.emails_received + lead_record.emails_sent
      ),
      'isEngaged', lead_record.texts_received > 0 OR lead_record.calls_incoming > 0
    )
  );
  
  RETURN context;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment documentation
COMMENT ON COLUMN leads.phones IS 'Complete array of phone numbers with type and primary flag from FUB';
COMMENT ON COLUMN leads.emails IS 'Complete array of email addresses with type and primary flag from FUB';
COMMENT ON COLUMN leads.addresses IS 'Complete array of addresses from FUB';
COMMENT ON COLUMN leads.fub_data IS 'Complete raw FUB API response for reference and debugging';
COMMENT ON COLUMN leads.last_fub_sync IS 'Timestamp of last successful sync from FUB';

COMMENT ON FUNCTION build_ai_context IS 'Builds comprehensive context object for AI from lead data';
COMMENT ON FUNCTION extract_fub_custom_fields IS 'Extracts all custom fields from FUB data';

-- Migrate existing data to use new structure (if any)
UPDATE leads 
SET 
  phones = CASE 
    WHEN phone IS NOT NULL THEN 
      jsonb_build_array(jsonb_build_object('value', phone, 'type', 'mobile', 'isPrimary', true))
    ELSE '[]'::jsonb
  END,
  emails = CASE 
    WHEN email IS NOT NULL THEN 
      jsonb_build_array(jsonb_build_object('value', email, 'type', 'home', 'isPrimary', true))
    ELSE '[]'::jsonb
  END
WHERE phones IS NULL OR phones = '[]'::jsonb;