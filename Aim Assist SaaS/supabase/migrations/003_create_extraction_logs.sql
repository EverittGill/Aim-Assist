-- Create extraction_logs table for AI data extraction history
CREATE TABLE IF NOT EXISTS public.extraction_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  extraction_type VARCHAR(50) NOT NULL, -- 'timeline', 'budget', 'contact_info', 'preferences', 'qualification'
  extracted_data JSONB NOT NULL, -- The extracted structured data
  confidence_score DECIMAL(3, 2) DEFAULT 0, -- 0.00 to 1.00
  method VARCHAR(50) NOT NULL, -- 'ai_claude', 'ai_gemini', 'regex', 'manual'
  source_text TEXT, -- Original text that was analyzed
  prompt_used TEXT, -- AI prompt if applicable
  model_version VARCHAR(100), -- AI model version used
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'partial', 'failed'
  error_message TEXT,
  auto_applied BOOLEAN DEFAULT false, -- Whether data was automatically applied to lead
  user_verified BOOLEAN DEFAULT false, -- Whether a user verified the extraction
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CHECK (status IN ('success', 'partial', 'failed', 'pending'))
);

-- Create indexes for performance
CREATE INDEX idx_extraction_logs_organization ON extraction_logs(organization_id);
CREATE INDEX idx_extraction_logs_lead ON extraction_logs(lead_id);
CREATE INDEX idx_extraction_logs_type ON extraction_logs(extraction_type);
CREATE INDEX idx_extraction_logs_status ON extraction_logs(status);
CREATE INDEX idx_extraction_logs_created ON extraction_logs(created_at DESC);
CREATE INDEX idx_extraction_logs_confidence ON extraction_logs(confidence_score DESC);
CREATE INDEX idx_extraction_logs_auto_applied ON extraction_logs(auto_applied) WHERE auto_applied = true;

-- Enable Row Level Security
ALTER TABLE extraction_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations can only see their own extraction logs
CREATE POLICY "extraction_logs_isolation" ON extraction_logs
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- Create a summary view for extraction success rates
CREATE VIEW extraction_success_rates AS
SELECT 
  organization_id,
  extraction_type,
  method,
  COUNT(*) as total_extractions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'partial') as partial,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(confidence_score) as avg_confidence,
  AVG(processing_time_ms) as avg_processing_time_ms,
  COUNT(*) FILTER (WHERE auto_applied = true) as auto_applied_count,
  COUNT(*) FILTER (WHERE user_verified = true) as verified_count
FROM extraction_logs
GROUP BY organization_id, extraction_type, method;

-- Add comments
COMMENT ON TABLE extraction_logs IS 'Logs all AI data extraction attempts from conversations';
COMMENT ON VIEW extraction_success_rates IS 'Aggregated view of extraction success rates by type and method';