-- Create sync_history table for tracking CRM sync operations
CREATE TABLE IF NOT EXISTS public.sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'full_sync', 'incremental', 'webhook', 'manual'
  entity_type VARCHAR(50) NOT NULL, -- 'leads', 'messages', 'tags', etc.
  entity_count INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB, -- Additional sync details
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'partial')),
  CHECK (sync_type IN ('full_sync', 'incremental', 'webhook', 'manual', 'scheduled', 'tag_poll'))
);

-- Create indexes for performance
CREATE INDEX idx_sync_history_organization ON sync_history(organization_id);
CREATE INDEX idx_sync_history_status ON sync_history(status);
CREATE INDEX idx_sync_history_created ON sync_history(created_at DESC);
CREATE INDEX idx_sync_history_type ON sync_history(sync_type, entity_type);

-- Enable Row Level Security
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations can only see their own sync history
CREATE POLICY "sync_history_isolation" ON sync_history
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Add comment
COMMENT ON TABLE sync_history IS 'Tracks all CRM synchronization operations for audit and debugging';

-- Add updated_at trigger
CREATE TRIGGER update_sync_history_updated_at
  BEFORE UPDATE ON sync_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();