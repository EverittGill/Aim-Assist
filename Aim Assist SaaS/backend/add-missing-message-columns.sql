-- Add missing columns to existing messages table
-- Run this if messages table exists but is missing columns

-- Add channel_type column if it doesn't exist
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) DEFAULT 'sms';

-- Add phone number columns if they don't exist
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS from_phone VARCHAR(20);

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS to_phone VARCHAR(20);

-- Add provider_sid if it doesn't exist
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS provider_sid VARCHAR(100);

-- Add sender_type if it doesn't exist
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS sender_type VARCHAR(20);

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
AND column_name IN ('channel_type', 'from_phone', 'to_phone', 'provider_sid', 'sender_type')
ORDER BY column_name;