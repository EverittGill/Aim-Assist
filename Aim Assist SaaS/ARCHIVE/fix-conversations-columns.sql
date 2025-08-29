-- Fix conversations table - add missing columns
-- These columns are required by the webhook processing

-- Add channel_type column (sms, email, etc.)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) NOT NULL DEFAULT 'sms';

-- Add ai_enabled column for enabling/disabling AI responses
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;

-- Add status column if not exists
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add last_message columns
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_from VARCHAR(50);

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_content TEXT;

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations'
AND column_name IN ('channel_type', 'ai_enabled', 'status', 'last_message_at', 'last_message_from', 'last_message_content')
ORDER BY column_name;