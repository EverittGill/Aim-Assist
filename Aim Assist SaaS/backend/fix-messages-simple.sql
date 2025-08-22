-- Fix messages table - ensure it exists and has proper structure
-- Simplified version without RLS policies

-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Message content
    content TEXT NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    channel_type VARCHAR(20) NOT NULL DEFAULT 'sms',
    
    -- Provider details
    provider VARCHAR(50) DEFAULT 'twilio',
    provider_sid VARCHAR(100),
    provider_status VARCHAR(50),
    
    -- AI details
    is_ai_generated BOOLEAN DEFAULT false,
    ai_model VARCHAR(50),
    ai_prompt_tokens INTEGER,
    ai_completion_tokens INTEGER,
    
    -- Phone numbers
    from_phone VARCHAR(20),
    to_phone VARCHAR(20),
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'sent',
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

-- Verify table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;