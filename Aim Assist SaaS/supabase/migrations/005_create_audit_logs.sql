-- Create audit_logs table for compliance and change tracking
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL, -- 'lead_updated', 'message_sent', 'extraction', 'settings_changed', etc.
  entity_type VARCHAR(50) NOT NULL, -- 'lead', 'message', 'user', 'organization', 'integration', etc.
  entity_id UUID, -- ID of the affected entity
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'send', 'receive', etc.
  actor_id UUID REFERENCES users(id), -- User who performed the action
  actor_type VARCHAR(50) DEFAULT 'user', -- 'user', 'system', 'webhook', 'api'
  ip_address INET, -- IP address of the actor
  user_agent TEXT, -- Browser/client user agent
  request_id UUID, -- For tracing related actions
  session_id UUID, -- For grouping actions in a session
  
  -- Change tracking
  old_values JSONB, -- Previous values (for updates)
  new_values JSONB, -- New values (for creates/updates)
  changes JSONB, -- Computed diff between old and new
  
  -- Additional context
  details JSONB, -- Event-specific details
  metadata JSONB, -- System metadata
  tags TEXT[], -- Searchable tags
  
  -- Status and error tracking
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed', 'pending'
  error_code VARCHAR(100),
  error_message TEXT,
  
  -- Timing
  duration_ms INTEGER, -- How long the operation took
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (status IN ('success', 'failed', 'pending', 'partial'))
);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_organization ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_status ON audit_logs(status) WHERE status != 'success';
CREATE INDEX idx_audit_logs_request ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_session ON audit_logs(session_id);
CREATE INDEX idx_audit_logs_tags ON audit_logs USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations can only see their own audit logs
CREATE POLICY "audit_logs_isolation" ON audit_logs
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Create a function to automatically log changes
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_organization_id UUID;
  v_old_values JSONB;
  v_new_values JSONB;
  v_changes JSONB;
BEGIN
  -- Get organization_id from the record
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_organization_id := NEW.organization_id;
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  ELSE -- UPDATE
    v_organization_id := NEW.organization_id;
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    
    -- Calculate changes
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
    INTO v_changes
    FROM (
      SELECT key, v_old_values->key as old_val, v_new_values->key as new_val
      FROM jsonb_object_keys(v_new_values) as key
      WHERE v_old_values->key IS DISTINCT FROM v_new_values->key
    ) as changed_fields;
  END IF;
  
  -- Insert audit log
  INSERT INTO audit_logs (
    organization_id,
    event_type,
    entity_type,
    entity_id,
    action,
    actor_type,
    old_values,
    new_values,
    changes,
    metadata
  ) VALUES (
    v_organization_id,
    TG_ARGV[0], -- event_type passed as argument
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    LOWER(TG_OP),
    'system',
    v_old_values,
    v_new_values,
    v_changes,
    jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'schema_name', TG_TABLE_SCHEMA,
      'trigger_name', TG_NAME
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system events and changes';
COMMENT ON FUNCTION log_audit_event IS 'Trigger function to automatically log changes to audit_logs table';