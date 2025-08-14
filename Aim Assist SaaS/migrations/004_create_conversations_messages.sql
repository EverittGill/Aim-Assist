-- Conversations and messages tables for SMS communication tracking

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Conversation status
  status VARCHAR(50) DEFAULT 'active', -- active, paused, completed, archived
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Metrics
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_ai_message_at TIMESTAMPTZ,
  last_human_message_at TIMESTAMPTZ,
  
  -- Qualification tracking
  qualification_status VARCHAR(50) DEFAULT 'not_qualified',
  qualified_at TIMESTAMPTZ,
  qualification_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message details
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  sender_type VARCHAR(20) NOT NULL, -- lead, ai, human
  content TEXT NOT NULL,
  
  -- SMS details
  phone_from VARCHAR(20),
  phone_to VARCHAR(20),
  twilio_sid VARCHAR(100),
  twilio_status VARCHAR(50),
  
  -- AI details (if AI generated)
  ai_provider VARCHAR(50), -- claude, gemini, gpt4
  ai_model VARCHAR(100),
  ai_temperature DECIMAL(3,2),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

-- Templates table for prompt management
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Template details
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- initial_outreach, conversation_reply, follow_up
  content TEXT NOT NULL,
  variables TEXT[], -- List of supported variables
  
  -- Usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique name per tenant
  CONSTRAINT unique_template_name_per_tenant UNIQUE(tenant_id, name)
);

-- Phone numbers table for Twilio numbers
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Phone details
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  friendly_name VARCHAR(100),
  
  -- Twilio details
  twilio_sid VARCHAR(100),
  twilio_subaccount_sid VARCHAR(100),
  capabilities JSONB DEFAULT '{"sms": true, "voice": false, "mms": false}'::jsonb,
  
  -- Usage
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  monthly_cost DECIMAL(10,2),
  
  -- Metadata
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  
  -- One primary number per tenant
  CONSTRAINT one_primary_phone_per_tenant UNIQUE(tenant_id, is_primary) WHERE is_primary = true
);

-- Auto-text rules table
CREATE TABLE IF NOT EXISTS auto_text_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule configuration
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  -- Conditions (all must match)
  conditions JSONB NOT NULL,
  -- Example: {
  --   "source": ["website", "zillow"],
  --   "tags": {"contains": ["hot"]},
  --   "time_since_created": {"max_minutes": 5}
  -- }
  
  -- Actions
  template_id UUID REFERENCES templates(id),
  delay_minutes INTEGER DEFAULT 1,
  
  -- Business hours
  respect_business_hours BOOLEAN DEFAULT true,
  
  -- Metrics
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(tenant_id, status);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_type ON templates(tenant_id, type);

CREATE INDEX idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX idx_auto_text_rules_tenant ON auto_text_rules(tenant_id, is_active);

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY messages_tenant_isolation ON messages
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY templates_tenant_isolation ON templates
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY phone_numbers_tenant_isolation ON phone_numbers
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY auto_text_rules_tenant_isolation ON auto_text_rules
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at 
  BEFORE UPDATE ON templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_text_rules_updated_at 
  BEFORE UPDATE ON auto_text_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE conversations IS 'SMS conversation threads with leads';
COMMENT ON TABLE messages IS 'Individual SMS messages within conversations';
COMMENT ON TABLE templates IS 'Customizable prompt templates for AI responses';
COMMENT ON TABLE phone_numbers IS 'Twilio phone numbers owned by tenants';
COMMENT ON TABLE auto_text_rules IS 'Automated text message rules based on lead attributes';