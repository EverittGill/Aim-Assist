-- Add missing columns to existing tables
-- Run this in Supabase SQL Editor after the main tables are created

-- Add crm_lead_id to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS crm_lead_id VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_crm_lead_id ON leads(tenant_id, crm_lead_id);

-- Add channel column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'sms';

-- Add twilio_sid to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(255);

-- Success message
SELECT 'Missing columns added successfully!' as status;