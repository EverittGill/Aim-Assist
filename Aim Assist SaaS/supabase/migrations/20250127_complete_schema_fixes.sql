-- Complete schema fixes for bidirectional messaging
-- Run this entire file in Supabase SQL editor

-- 1. Add phone columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS from_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS to_phone VARCHAR(50);

-- 2. Add comments for phone columns
COMMENT ON COLUMN messages.from_phone IS 'Phone number message was sent from';
COMMENT ON COLUMN messages.to_phone IS 'Phone number message was sent to';

-- 3. Add indexes for phone lookups
CREATE INDEX IF NOT EXISTS idx_messages_from_phone ON messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_messages_to_phone ON messages(to_phone);

-- 4. Verify all required columns exist in leads table
-- These should already exist but let's ensure they're present
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS fub_lead_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS crm_type VARCHAR(50) DEFAULT 'followupboss',
ADD COLUMN IF NOT EXISTS stage VARCHAR(50),
ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50) DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_pause_reason TEXT,
ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_fub_sync TIMESTAMPTZ;

-- 5. Verify all required columns exist in messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms',
ADD COLUMN IF NOT EXISTS provider_sid VARCHAR(255);

-- 6. Add unique constraint for FUB lead ID if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_fub_lead'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT unique_fub_lead UNIQUE(organization_id, fub_lead_id);
    END IF;
END $$;

-- 7. Drop and recreate function to find lead by phone (if signature changed)
DROP FUNCTION IF EXISTS find_lead_by_phone(UUID, TEXT);

CREATE FUNCTION find_lead_by_phone(
  p_org_id UUID,
  p_phone TEXT
) RETURNS TABLE (
  lead_id UUID,
  fub_lead_id VARCHAR(100),
  lead_name TEXT,
  ai_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id as lead_id,
    l.fub_lead_id,
    CONCAT(l.first_name, ' ', l.last_name) as lead_name,
    l.ai_enabled
  FROM leads l
  WHERE l.organization_id = p_org_id
  AND (
    l.phone LIKE '%' || REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g') || '%'
    OR l.phone_secondary LIKE '%' || REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g') || '%'
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. Grant necessary permissions (adjust roles as needed)
GRANT SELECT, INSERT, UPDATE ON leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;

-- 9. Refresh the schema cache (this helps Supabase recognize new columns)
NOTIFY pgrst, 'reload schema';