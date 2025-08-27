-- Add channel_type column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms';

-- Add comment
COMMENT ON COLUMN messages.channel_type IS 'Communication channel: sms, voice, whatsapp, etc';