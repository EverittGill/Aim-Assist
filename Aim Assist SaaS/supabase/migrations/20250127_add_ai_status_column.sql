-- Add ai_status column to leads table
-- This maps the existing ai_enabled and ai_paused_until columns to a simple status field

ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50) DEFAULT 'inactive';

-- Update existing records based on current fields
UPDATE leads 
SET ai_status = CASE 
  WHEN ai_enabled = false THEN 'inactive'
  WHEN ai_paused_until IS NOT NULL AND ai_paused_until > NOW() THEN 'paused'
  WHEN ai_enabled = true THEN 'active'
  ELSE 'inactive'
END;

-- Add comment
COMMENT ON COLUMN leads.ai_status IS 'AI conversation status: active, paused, inactive (derived from ai_enabled and ai_paused_until)';
