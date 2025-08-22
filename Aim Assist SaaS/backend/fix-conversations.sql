-- Add missing ai_enabled column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false;

-- Add any other missing columns
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversations'
ORDER BY ordinal_position;
