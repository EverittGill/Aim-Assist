-- Create tag polling configurations table
CREATE TABLE IF NOT EXISTS tag_polling_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tag_name VARCHAR(255) NOT NULL,
    interval_minutes INTEGER DEFAULT 5,
    process_immediately BOOLEAN DEFAULT TRUE,
    enable_ai BOOLEAN DEFAULT TRUE,
    send_auto_text BOOLEAN DEFAULT TRUE,
    business_hours_only BOOLEAN DEFAULT FALSE,
    start_hour INTEGER DEFAULT 9,
    end_hour INTEGER DEFAULT 20,
    timezone VARCHAR(100) DEFAULT 'America/New_York',
    job_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, tag_name)
);

-- Create indexes for tag polling configs
CREATE INDEX idx_tag_polling_configs_org ON tag_polling_configs(organization_id);
CREATE INDEX idx_tag_polling_configs_active ON tag_polling_configs(is_active);
CREATE INDEX idx_tag_polling_configs_tag ON tag_polling_configs(tag_name);

-- Insert default AIM_ASSIST configuration for existing tenant
INSERT INTO tag_polling_configs (
    organization_id,
    tag_name,
    interval_minutes,
    process_immediately,
    enable_ai,
    send_auto_text,
    business_hours_only,
    is_active
) VALUES (
    '655cd229-b2e9-4737-843b-7488fe9d33e6',
    'AIM_ASSIST',
    5,
    TRUE,
    TRUE,
    TRUE,  -- Enable auto-text!
    FALSE,
    TRUE
) ON CONFLICT (organization_id, tag_name) DO UPDATE 
SET 
    send_auto_text = TRUE,
    enable_ai = TRUE,
    updated_at = NOW();

-- Enable RLS
ALTER TABLE tag_polling_configs ENABLE ROW LEVEL SECURITY;

-- RLS policy for tag polling configs
CREATE POLICY "Organizations can manage their tag polling configs"
ON tag_polling_configs
FOR ALL
USING (organization_id IN (
    SELECT organization_id FROM organization_users 
    WHERE user_id = auth.uid()
));