-- Migration: Add AI Prompts Table for Per-Tenant Customization
-- This allows each tenant to customize their AI conversation prompts

-- Create ai_prompts table
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Prompt identification
  prompt_key VARCHAR(50) NOT NULL,
  category VARCHAR(50) DEFAULT 'custom',
  
  -- Prompt content
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  max_length INTEGER DEFAULT 160,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Ensure unique prompt keys per tenant
  UNIQUE(tenant_id, prompt_key)
);

-- Create indexes
CREATE INDEX idx_ai_prompts_tenant_id ON ai_prompts(tenant_id);
CREATE INDEX idx_ai_prompts_key ON ai_prompts(prompt_key);
CREATE INDEX idx_ai_prompts_active ON ai_prompts(is_active);

-- Enable RLS
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view own prompts" ON ai_prompts
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY "Tenants can insert own prompts" ON ai_prompts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY "Tenants can update own prompts" ON ai_prompts
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY "Tenants can delete own prompts" ON ai_prompts
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Add escalation_keywords to tenant_settings if not exists
ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS escalation_keywords JSONB DEFAULT '["stop", "unsubscribe", "human", "agent", "call me"]'::jsonb;

-- Insert some default prompt examples for existing tenants
INSERT INTO ai_prompts (tenant_id, prompt_key, category, template, variables)
SELECT 
  id as tenant_id,
  'initial_outreach' as prompt_key,
  'outreach' as category,
  'Hi {{leadName}}! I saw you were interested in real estate through {{leadSource}}. What type of property are you looking for?' as template,
  '["leadName", "leadSource"]'::jsonb as variables
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM ai_prompts 
  WHERE ai_prompts.tenant_id = tenants.id 
  AND ai_prompts.prompt_key = 'initial_outreach'
);

-- Grant permissions
GRANT ALL ON ai_prompts TO authenticated;
GRANT ALL ON ai_prompts TO service_role;