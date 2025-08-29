-- Add Missing Helper Functions
-- Run this after BALANCED_MIGRATIONS_CLEAN.sql

-- Insert message function
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

-- Get recent messages
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

-- Calculate qualification score
CREATE OR REPLACE FUNCTION calculate_qualification_score(p_lead_id UUID)
RETURNS INTEGER AS $$
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
  
  -- Score based on timeline (30 points max)
  IF v_qual.timeline_to_move IS NOT NULL THEN
    v_score := v_score + CASE 
      WHEN v_qual.timeline_to_move ILIKE '%immediate%' OR v_qual.timeline_to_move ILIKE '%asap%' THEN 30
      WHEN v_qual.timeline_to_move ILIKE '%30 days%' OR v_qual.timeline_to_move ILIKE '%month%' THEN 25
      WHEN v_qual.timeline_to_move ILIKE '%3 months%' THEN 20
      WHEN v_qual.timeline_to_move ILIKE '%6 months%' THEN 15
      ELSE 10
    END;
  END IF;
  
  -- Score based on working with agent (20 points)
  IF v_qual.working_with_agent = false THEN
    v_score := v_score + 20;
  END IF;
  
  -- Score based on financing (25 points max)
  IF v_qual.financing_status IS NOT NULL THEN
    v_score := v_score + CASE
      WHEN v_qual.financing_status = 'cash' THEN 25
      WHEN v_qual.financing_status = 'pre_approved' THEN 20
      WHEN v_qual.financing_status = 'need_financing' THEN 10
      ELSE 5
    END;
  END IF;
  
  -- Score based on interest indicators (25 points max)
  IF v_qual.wants_phone_call = true THEN
    v_score := v_score + 15;
  END IF;
  
  IF v_qual.wants_showing = true THEN
    v_score := v_score + 10;
  END IF;
  
  -- Update the score
  UPDATE lead_qualifications
  SET 
    qualification_score = v_score,
    is_qualified = (v_score >= 60),
    last_analyzed_at = NOW()
  WHERE lead_id = p_lead_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Get default prompt
CREATE OR REPLACE FUNCTION get_default_prompt(
  p_org_id UUID,
  p_prompt_type VARCHAR(50)
) RETURNS TABLE (
  prompt_id UUID,
  name VARCHAR(100),
  system_prompt TEXT,
  user_prompt_template TEXT,
  variables TEXT[],
  model_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id as prompt_id,
    ai_prompts.name,
    ai_prompts.system_prompt,
    ai_prompts.user_prompt_template,
    ai_prompts.variables,
    ai_prompts.model_config
  FROM ai_prompts
  WHERE organization_id = p_org_id
  AND prompt_type = p_prompt_type
  AND is_default = true
  AND is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get monthly usage
CREATE OR REPLACE FUNCTION get_monthly_usage(p_org_id UUID)
RETURNS TABLE (
  event_type VARCHAR(50),
  total_quantity BIGINT,
  last_event TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    usage_events.event_type,
    SUM(quantity)::BIGINT as total_quantity,
    MAX(created_at) as last_event
  FROM usage_events
  WHERE organization_id = p_org_id
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY usage_events.event_type;
END;
$$ LANGUAGE plpgsql STABLE;

-- System health check
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  RETURN QUERY
  
  -- Check tables exist
  SELECT 
    'Tables Created'::TEXT,
    'OK'::TEXT,
    'Count: ' || COUNT(*)::TEXT
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  
  UNION ALL
  
  -- Check functions exist
  SELECT 
    'Functions Created'::TEXT,
    'OK'::TEXT,
    'Count: ' || COUNT(*)::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  
  UNION ALL
  
  -- Check indexes
  SELECT 
    'Indexes Created'::TEXT,
    'OK'::TEXT,
    'Count: ' || COUNT(*)::TEXT
  FROM pg_indexes
  WHERE schemaname = 'public'
  
  UNION ALL
  
  -- Check constraints
  SELECT 
    'Constraints'::TEXT,
    'OK'::TEXT,
    'Unique constraints: ' || COUNT(*)::TEXT
  FROM information_schema.table_constraints
  WHERE constraint_schema = 'public'
  AND constraint_type = 'UNIQUE';
END;
$$ LANGUAGE plpgsql;

-- Grant execution permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'All missing functions added successfully!';
  RAISE NOTICE 'Functions created: 6';
  RAISE NOTICE 'Ready for complete testing';
END $$;