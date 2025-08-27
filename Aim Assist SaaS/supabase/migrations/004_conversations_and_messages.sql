-- Migration 004: Conversations and Messages
-- Simple design, no partitioning (add later if needed)

-- Conversations table
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, paused, completed
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Metrics (denormalized for performance)
  message_count INTEGER DEFAULT 0,
  ai_message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One active conversation per lead
  CONSTRAINT unique_active_conversation UNIQUE(lead_id, status) WHERE status = 'active'
);

-- Messages table (simple, no partitioning yet)
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links (denormalized for query performance)
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message details
  direction message_direction NOT NULL,
  sender_type sender_type NOT NULL,
  sender_id UUID, -- agent_id if agent sent it
  
  -- Content
  content TEXT NOT NULL,
  
  -- Provider info
  provider VARCHAR(20), -- twilio, telnyx
  provider_message_id VARCHAR(255), -- Twilio SID
  provider_status VARCHAR(50), -- sent, delivered, failed
  
  -- Metadata (flexible storage)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_active ON conversations(organization_id, status) WHERE status = 'active';

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org ON messages(organization_id, created_at DESC);
CREATE INDEX idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX idx_messages_provider_id ON messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Function to get or create conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_lead_id UUID
) RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  -- Get organization from lead
  SELECT organization_id INTO v_org_id
  FROM leads WHERE id = p_lead_id;
  
  -- Find existing active conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE lead_id = p_lead_id
  AND status = 'active';
  
  IF v_conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO conversations (organization_id, lead_id)
    VALUES (v_org_id, p_lead_id)
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to insert message and update metrics
CREATE OR REPLACE FUNCTION insert_message(
  p_conversation_id UUID,
  p_direction message_direction,
  p_sender_type sender_type,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_org_id UUID;
  v_lead_id UUID;
BEGIN
  -- Get org and lead from conversation
  SELECT organization_id, lead_id 
  INTO v_org_id, v_lead_id
  FROM conversations 
  WHERE id = p_conversation_id;
  
  -- Insert message
  INSERT INTO messages (
    conversation_id,
    organization_id,
    lead_id,
    direction,
    sender_type,
    content,
    metadata
  ) VALUES (
    p_conversation_id,
    v_org_id,
    v_lead_id,
    p_direction,
    p_sender_type,
    p_content,
    p_metadata
  ) RETURNING id INTO v_message_id;
  
  -- Update conversation metrics
  UPDATE conversations
  SET 
    message_count = message_count + 1,
    ai_message_count = CASE 
      WHEN p_sender_type = 'ai' THEN ai_message_count + 1 
      ELSE ai_message_count 
    END,
    agent_message_count = CASE 
      WHEN p_sender_type = 'agent' THEN agent_message_count + 1 
      ELSE agent_message_count 
    END,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = p_conversation_id;
  
  -- Update lead activity
  UPDATE leads
  SET 
    message_count = message_count + 1,
    last_activity_at = NOW(),
    last_inbound_at = CASE 
      WHEN p_direction = 'inbound' THEN NOW() 
      ELSE last_inbound_at 
    END,
    last_outbound_at = CASE 
      WHEN p_direction = 'outbound' THEN NOW() 
      ELSE last_outbound_at 
    END,
    updated_at = NOW()
  WHERE id = v_lead_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent messages
CREATE OR REPLACE FUNCTION get_recent_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  message_id UUID,
  direction message_direction,
  sender_type sender_type,
  content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id as message_id,
    messages.direction,
    messages.sender_type,
    messages.content,
    messages.created_at
  FROM messages
  WHERE conversation_id = p_conversation_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE conversations IS 'Conversation threads (simple design, no partitioning)';
COMMENT ON TABLE messages IS 'Messages (will partition later if needed)';
COMMENT ON FUNCTION get_or_create_conversation IS 'Get existing or create new conversation';
COMMENT ON FUNCTION insert_message IS 'Insert message with automatic metric updates';