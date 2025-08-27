-- Add phone columns to leads table
-- These should store normalized phone numbers in E.164 format (+1XXXXXXXXXX)

ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS phone_secondary VARCHAR(20);

-- Add index for faster phone lookups
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_organization_phone ON leads(organization_id, phone);

-- Update existing leads to move phone from custom_data to dedicated column
UPDATE leads 
SET 
  phone = custom_data->>'primary_phone',
  phone_secondary = (custom_data->'phones')::jsonb->0->>'value'
WHERE 
  phone IS NULL 
  AND custom_data->>'primary_phone' IS NOT NULL;