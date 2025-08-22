-- Fix conversations table to have all required columns
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false;

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms';

-- Add messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id VARCHAR(255),
  crm_message_id VARCHAR(255),
  external_id VARCHAR(255),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type VARCHAR(50),
  content TEXT NOT NULL,
  channel VARCHAR(50) DEFAULT 'sms',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_messages_tenant_lead ON messages(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_crm_id ON messages(crm_message_id);

-- Verify the table structure
SELECT 'Conversations columns:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversations'
ORDER BY ordinal_position;

SELECT 'Messages columns:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;