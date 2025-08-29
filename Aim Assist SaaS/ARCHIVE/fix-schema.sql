-- Fix database schema for Aim Assist SaaS
-- Run this in Supabase SQL Editor

-- Add missing columns to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS crm_lead_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS crm_type VARCHAR(50) DEFAULT 'followupboss';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_crm_lead_id ON leads(tenant_id, crm_lead_id);

-- Add missing columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'sms',
ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(255);

-- Create lead 616 in database (the one FUB is finding)
INSERT INTO leads (
  tenant_id,
  crm_lead_id,
  crm_type,
  first_name,
  last_name,
  phone,
  email,
  status,
  source,
  tags
) VALUES (
  '7c563f31-36bd-4414-ad44-ef9c19c1c6b1', -- Demo tenant UUID
  '616',                                    -- FUB lead ID
  'followupboss',
  '2nd Test',
  'ENG',
  '+17068184445',
  null,
  'active',
  'sms',
  ARRAY['test_lead']::text[]
) ON CONFLICT DO NOTHING;

-- Verify the lead was created
SELECT id, crm_lead_id, first_name, last_name, phone 
FROM leads 
WHERE tenant_id = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';

-- Success message
SELECT 'Schema fixed and lead 616 created!' as status;