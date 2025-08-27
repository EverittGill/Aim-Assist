-- Migration 005: AI Prompts and Lead Qualification
-- Flexible prompt system and single-source qualification tracking

-- AI Prompts table (for customizable prompts per org)
CREATE TABLE ai_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Organization ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Prompt details
  name VARCHAR(100) NOT NULL,
  prompt_type VARCHAR(50) NOT NULL, -- initial, reply, follow_up, reengagement
  
  -- The actual prompts
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  
  -- Variables this prompt uses
  variables TEXT[] DEFAULT '{}',
  
  -- Model configuration
  model_config JSONB DEFAULT '{
    "temperature": 0.7,
    "max_tokens": 1000,
    "model": "claude-3-haiku"
  }'::jsonb,
  
  -- Status and usage
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Performance tracking
  metrics JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One default per type per org
  CONSTRAINT unique_default_prompt UNIQUE(organization_id, prompt_type, is_default) WHERE is_default = true,
  CONSTRAINT unique_prompt_name UNIQUE(organization_id, name)
);

-- Lead Qualification (single source of truth)
CREATE TABLE lead_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- One qualification per lead
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  
  -- Key qualification data
  timeline_to_move TEXT,
  working_with_agent BOOLEAN,
  financing_status TEXT, -- pre_approved, cash, need_financing
  budget_range TEXT,
  
  -- Property preferences
  property_type TEXT,
  desired_location TEXT,
  must_haves TEXT[],
  
  -- Scoring
  qualification_score INTEGER DEFAULT 0, -- 0-100
  is_qualified BOOLEAN DEFAULT false,
  qualification_reason TEXT,
  qualified_at TIMESTAMPTZ,
  
  -- Interest indicators
  wants_phone_call BOOLEAN DEFAULT false,
  wants_showing BOOLEAN DEFAULT false,
  urgency_level VARCHAR(20), -- high, medium, low
  
  -- Additional data
  data JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Prompt History (for tracking what was sent)
CREATE TABLE ai_prompt_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Links
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  
  -- What was sent
  actual_prompt TEXT NOT NULL,
  variables_used JSONB,
  
  -- AI response details
  model_used VARCHAR(100),
  tokens_used INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_prompts_org ON ai_prompts(organization_id);
CREATE INDEX idx_ai_prompts_type ON ai_prompts(organization_id, prompt_type, is_active);
CREATE INDEX idx_lead_qualifications_lead ON lead_qualifications(lead_id);
CREATE INDEX idx_lead_qualifications_qualified ON lead_qualifications(is_qualified) WHERE is_qualified = true;
CREATE INDEX idx_ai_prompt_history_org ON ai_prompt_history(organization_id, created_at DESC);

-- Function to get default prompt for type
CREATE OR REPLACE FUNCTION get_default_prompt(
  p_org_id UUID,
  p_prompt_type VARCHAR(50)
) RETURNS ai_prompts AS $$
DECLARE
  v_prompt ai_prompts;
BEGIN
  SELECT * INTO v_prompt
  FROM ai_prompts
  WHERE organization_id = p_org_id
  AND prompt_type = p_prompt_type
  AND is_active = true
  AND is_default = true
  LIMIT 1;
  
  -- If no default, get any active prompt of that type
  IF v_prompt IS NULL THEN
    SELECT * INTO v_prompt
    FROM ai_prompts
    WHERE organization_id = p_org_id
    AND prompt_type = p_prompt_type
    AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN v_prompt;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate qualification score
CREATE OR REPLACE FUNCTION calculate_qualification_score(
  p_lead_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_qual RECORD;
BEGIN
  SELECT * INTO v_qual
  FROM lead_qualifications
  WHERE lead_id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Score based on key factors
  IF v_qual.timeline_to_move IS NOT NULL THEN
    v_score := v_score + 20;
    IF v_qual.timeline_to_move ILIKE '%month%' OR 
       v_qual.timeline_to_move ILIKE '%soon%' OR
       v_qual.timeline_to_move ILIKE '%asap%' THEN
      v_score := v_score + 10;
    END IF;
  END IF;
  
  IF v_qual.working_with_agent = false THEN
    v_score := v_score + 25;
  ELSIF v_qual.working_with_agent IS NOT NULL THEN
    v_score := v_score + 5;
  END IF;
  
  IF v_qual.financing_status IN ('pre_approved', 'cash') THEN
    v_score := v_score + 25;
  ELSIF v_qual.financing_status IS NOT NULL THEN
    v_score := v_score + 10;
  END IF;
  
  IF v_qual.budget_range IS NOT NULL THEN
    v_score := v_score + 15;
  END IF;
  
  IF v_qual.wants_phone_call OR v_qual.wants_showing THEN
    v_score := v_score + 15;
  END IF;
  
  -- Update the score
  UPDATE lead_qualifications
  SET 
    qualification_score = v_score,
    is_qualified = v_score >= 60,
    qualification_reason = CASE
      WHEN v_qual.wants_phone_call THEN 'Requested phone call'
      WHEN v_qual.wants_showing THEN 'Wants to see property'
      WHEN v_score >= 80 THEN 'Highly qualified'
      WHEN v_score >= 60 THEN 'Qualified'
      WHEN v_score >= 40 THEN 'Partially qualified'
      ELSE 'Needs nurturing'
    END,
    qualified_at = CASE 
      WHEN v_score >= 60 AND qualified_at IS NULL THEN NOW()
      ELSE qualified_at
    END,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_ai_prompts_updated_at 
  BEFORE UPDATE ON ai_prompts 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_qualifications_updated_at 
  BEFORE UPDATE ON lead_qualifications 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE ai_prompts IS 'Customizable AI prompts per organization';
COMMENT ON TABLE lead_qualifications IS 'Single source of truth for lead qualification';
COMMENT ON TABLE ai_prompt_history IS 'Track what prompts were used for each message';
COMMENT ON FUNCTION calculate_qualification_score IS 'Calculate lead score based on qualification data';