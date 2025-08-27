-- Add phone columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS from_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS to_phone VARCHAR(50);

-- Add comments
COMMENT ON COLUMN messages.from_phone IS 'Phone number message was sent from';
COMMENT ON COLUMN messages.to_phone IS 'Phone number message was sent to';

-- Add indexes for phone lookups
CREATE INDEX IF NOT EXISTS idx_messages_from_phone ON messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_messages_to_phone ON messages(to_phone);