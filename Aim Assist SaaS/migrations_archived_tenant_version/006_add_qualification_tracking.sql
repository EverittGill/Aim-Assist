-- Supplemental migration for qualification tracking
-- Adds fields identified from Eugenia bot analysis
-- Tracks lead qualification progress in detail

-- Add qualification tracking fields to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS timeline_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS timeline_response TEXT,
ADD COLUMN IF NOT EXISTS agent_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_response TEXT,
ADD COLUMN IF NOT EXISTS financing_status BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS financing_response TEXT,
ADD COLUMN IF NOT EXISTS phone_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduling_interest_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS high_engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_complete_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS agent_notified_at TIMESTAMPTZ;

-- Add custom field mappings to CRM integrations
ALTER TABLE crm_integrations 
ADD COLUMN IF NOT EXISTS custom_field_mappings JSONB DEFAULT '{
  "ai_status_field": "customEugeniaTalkingStatus",
  "conversation_link_field": "customAimAssist", 
  "pause_until_field": "customEugeniaPausedUntil",
  "qualification_status_field": "customQualificationStatus"
}'::jsonb;

-- Add notification settings to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_after_messages INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS notification_pause_hours INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notification_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "sms_enabled": true,
  "email_enabled": false,
  "webhook_enabled": false,
  "qualified_lead_alert": true,
  "escalation_alert": true,
  "opt_out_alert": true
}'::jsonb;

-- Add template enhancements
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 160,
ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS system_prompt TEXT,
ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;

-- Add message tracking fields
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS qualification_detected JSONB,
ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false;

-- Create qualification_events table for tracking
CREATE TABLE IF NOT EXISTS qualification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- timeline_answered, agent_status_answered, etc.
  event_data JSONB,
  detected_from_message UUID REFERENCES messages(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT unique_event_per_conversation UNIQUE(conversation_id, event_type)
);

-- Create notification_queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- qualified_lead, escalation, opt_out
  priority INTEGER DEFAULT 5,
  channel VARCHAR(20) NOT NULL, -- sms, email, webhook
  recipient VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_qualification_events_tenant ON qualification_events(tenant_id);
CREATE INDEX idx_qualification_events_conversation ON qualification_events(conversation_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status, scheduled_for);
CREATE INDEX idx_notification_queue_tenant ON notification_queue(tenant_id);

-- Enable RLS on new tables
ALTER TABLE qualification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY qualification_events_tenant_isolation ON qualification_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY notification_queue_tenant_isolation ON notification_queue
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Add triggers for updated_at on notification_queue
CREATE TRIGGER update_notification_queue_updated_at 
  BEFORE UPDATE ON notification_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE qualification_events IS 'Tracks qualification milestones detected in conversations';
COMMENT ON TABLE notification_queue IS 'Queue for SMS, email, and webhook notifications to agents';
COMMENT ON COLUMN conversations.timeline_status IS 'Whether lead has answered timeline question';
COMMENT ON COLUMN conversations.agent_status IS 'Whether lead has indicated agent status';
COMMENT ON COLUMN conversations.financing_status IS 'Whether lead has provided financing info';
COMMENT ON COLUMN conversations.high_engagement_score IS 'Engagement score based on message count and qualification answers';
COMMENT ON COLUMN tenants.notification_phone IS 'Primary phone number for agent notifications';
COMMENT ON COLUMN tenants.notification_preferences IS 'JSON configuration for notification channels and types';