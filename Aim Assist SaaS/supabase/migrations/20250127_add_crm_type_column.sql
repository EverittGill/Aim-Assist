-- Add missing crm_type column to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS crm_type VARCHAR(50) DEFAULT 'followupboss';

-- Add comment
COMMENT ON COLUMN leads.crm_type IS 'Type of CRM integration: followupboss, lofty, etc';