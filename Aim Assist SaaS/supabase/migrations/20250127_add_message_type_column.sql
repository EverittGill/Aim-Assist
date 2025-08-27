-- Add message_type column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text';

-- Add comment
COMMENT ON COLUMN messages.message_type IS 'Type of message: text, voice, image, etc';

-- Add index for message type queries
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);