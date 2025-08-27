-- Migration 008: Row Level Security and Final Setup
-- Complete RLS policies and helper functions

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_text_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS
CREATE OR REPLACE FUNCTION get_user_organization()
RETURNS UUID AS $$
  SELECT organization_id 
  FROM agents 
  WHERE user_id = auth.uid() 
  AND is_active = true 
  AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (id = get_user_organization());

CREATE POLICY "Owners can update organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM agents 
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Agents policies
CREATE POLICY "Users can view agents in their org" ON agents
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can update their own agent record" ON agents
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage agents" ON agents
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND organization_id = agents.organization_id
    )
  );

-- Leads policies
CREATE POLICY "Users can view leads in their org" ON leads
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage leads in their org" ON leads
  FOR ALL USING (organization_id = get_user_organization());

-- Lead phones policies
CREATE POLICY "Users can view phones in their org" ON lead_phones
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage phones in their org" ON lead_phones
  FOR ALL USING (organization_id = get_user_organization());

-- Conversations policies
CREATE POLICY "Users can view conversations in their org" ON conversations
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage conversations in their org" ON conversations
  FOR ALL USING (organization_id = get_user_organization());

-- Messages policies
CREATE POLICY "Users can view messages in their org" ON messages
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can create messages in their org" ON messages
  FOR INSERT WITH CHECK (organization_id = get_user_organization());

-- AI prompts policies
CREATE POLICY "Users can view prompts in their org" ON ai_prompts
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Users can manage prompts in their org" ON ai_prompts
  FOR ALL USING (organization_id = get_user_organization());

-- Lead qualifications policies
CREATE POLICY "Users can view qualifications" ON lead_qualifications
  FOR SELECT USING (
    lead_id IN (SELECT id FROM leads WHERE organization_id = get_user_organization())
  );

CREATE POLICY "Users can manage qualifications" ON lead_qualifications
  FOR ALL USING (
    lead_id IN (SELECT id FROM leads WHERE organization_id = get_user_organization())
  );

-- Auto-text rules policies
CREATE POLICY "Users can view auto-text rules" ON auto_text_rules
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Admins can manage auto-text rules" ON auto_text_rules
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Usage events policies (read-only for users)
CREATE POLICY "Users can view usage in their org" ON usage_events
  FOR SELECT USING (organization_id = get_user_organization());

-- Service role can insert usage events
CREATE POLICY "Service role can insert usage" ON usage_events
  FOR INSERT USING (true);

-- CRM configs policies
CREATE POLICY "Users can view CRM configs" ON crm_configs
  FOR SELECT USING (organization_id = get_user_organization());

CREATE POLICY "Admins can manage CRM configs" ON crm_configs
  FOR ALL USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Webhook logs policies
CREATE POLICY "Admins can view webhook logs" ON webhook_logs
  FOR SELECT USING (
    organization_id = get_user_organization() AND
    EXISTS (
      SELECT 1 FROM agents 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Service role can insert webhook logs
CREATE POLICY "Service role can insert webhook logs" ON webhook_logs
  FOR INSERT USING (true);

-- Additional performance indexes
CREATE INDEX idx_leads_last_activity ON leads(organization_id, last_activity_at DESC) 
  WHERE deleted_at IS NULL;
  
CREATE INDEX idx_messages_created_recent ON messages(created_at DESC) 
  WHERE created_at > CURRENT_DATE - INTERVAL '7 days';

-- System health check function
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  RETURN QUERY
  
  -- Check RLS is enabled
  SELECT 
    'RLS Enabled'::TEXT,
    CASE 
      WHEN COUNT(*) = 13 THEN 'OK'::TEXT
      ELSE 'WARNING'::TEXT
    END,
    'Tables with RLS: ' || COUNT(*)::TEXT
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
  AND c.relrowsecurity = true
  AND t.tablename IN (
    'organizations', 'agents', 'leads', 'lead_phones',
    'conversations', 'messages', 'ai_prompts', 'lead_qualifications',
    'ai_prompt_history', 'auto_text_rules', 'usage_events',
    'crm_configs', 'webhook_logs'
  );
  
  UNION ALL
  
  -- Check indexes
  SELECT 
    'Indexes'::TEXT,
    'OK'::TEXT,
    'Total indexes: ' || COUNT(*)::TEXT
  FROM pg_indexes
  WHERE schemaname = 'public';
  
  UNION ALL
  
  -- Check functions
  SELECT 
    'Functions'::TEXT,
    'OK'::TEXT,
    'Helper functions: ' || COUNT(*)::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public';
END;
$$ LANGUAGE plpgsql;

-- Lead context function for AI
CREATE OR REPLACE FUNCTION get_lead_context(
  p_lead_id UUID,
  p_message_limit INTEGER DEFAULT 20
) RETURNS JSONB AS $$
DECLARE
  v_context JSONB;
  v_lead RECORD;
  v_messages JSONB;
  v_qualification RECORD;
BEGIN
  -- Get lead data
  SELECT 
    l.*,
    o.name as org_name,
    o.settings as org_settings
  INTO v_lead
  FROM leads l
  JOIN organizations o ON o.id = l.organization_id
  WHERE l.id = p_lead_id;
  
  -- Get recent messages
  SELECT jsonb_agg(
    jsonb_build_object(
      'direction', m.direction,
      'sender_type', m.sender_type,
      'content', m.content,
      'created_at', m.created_at
    ) ORDER BY m.created_at DESC
  ) INTO v_messages
  FROM (
    SELECT * FROM messages
    WHERE lead_id = p_lead_id
    ORDER BY created_at DESC
    LIMIT p_message_limit
  ) m;
  
  -- Get qualification
  SELECT * INTO v_qualification
  FROM lead_qualifications
  WHERE lead_id = p_lead_id;
  
  -- Build context
  v_context := jsonb_build_object(
    'lead', jsonb_build_object(
      'name', CONCAT(v_lead.first_name, ' ', v_lead.last_name),
      'source', v_lead.source,
      'tags', v_lead.tags,
      'custom_data', v_lead.custom_data
    ),
    'organization', jsonb_build_object(
      'name', v_lead.org_name,
      'settings', v_lead.org_settings
    ),
    'messages', COALESCE(v_messages, '[]'::jsonb),
    'qualification', CASE 
      WHEN v_qualification.id IS NOT NULL THEN
        jsonb_build_object(
          'timeline', v_qualification.timeline_to_move,
          'working_with_agent', v_qualification.working_with_agent,
          'financing', v_qualification.financing_status,
          'budget', v_qualification.budget_range,
          'score', v_qualification.qualification_score
        )
      ELSE NULL
    END
  );
  
  RETURN v_context;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Final setup
DO $$
BEGIN
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Run SELECT * FROM system_health_check() to verify setup.';
END $$;

-- Comments
COMMENT ON FUNCTION get_user_organization IS 'Get current user organization for RLS';
COMMENT ON FUNCTION system_health_check IS 'Verify database setup is complete';
COMMENT ON FUNCTION get_lead_context IS 'Get complete lead context for AI processing';