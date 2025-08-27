-- Migration: 007_brokerage_hierarchy.sql
-- Purpose: Add support for brokerage/agent hierarchy in tenants table
-- Date: 2025-01-22

-- Add new columns to tenants table for hierarchy support
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'standalone',
ADD COLUMN IF NOT EXISTS parent_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS subdomain VARCHAR(255),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Create index for parent-child lookups
CREATE INDEX IF NOT EXISTS idx_tenants_parent_id ON tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON tenants(type);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);

-- Update settings JSONB to include new fields if not present
UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{twilio_phone}',
    'null'::jsonb,
    false
)
WHERE NOT (settings ? 'twilio_phone');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{notification_phone}',
    'null'::jsonb,
    false
)
WHERE NOT (settings ? 'notification_phone');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{lead_sync_tags}',
    '[]'::jsonb,
    false
)
WHERE NOT (settings ? 'lead_sync_tags');

UPDATE tenants 
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{crm_config}',
    '{}'::jsonb,
    false
)
WHERE NOT (settings ? 'crm_config');

-- Create phone_numbers table for multi-tenant phone management
CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    provider_sid VARCHAR(255), -- Twilio SID
    capabilities JSONB DEFAULT '{"sms": true, "mms": true, "voice": false}',
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone_number)
);

-- Create index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant_id ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_active ON phone_numbers(is_active);

-- Create campaign_metrics table for nurturing tracking
CREATE TABLE IF NOT EXISTS public.campaign_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_type VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'sent', 'opened', 'clicked', 'replied'
    message_content TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for campaign metrics
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_tenant_id ON campaign_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_lead_id ON campaign_metrics(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_type ON campaign_metrics(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_timestamp ON campaign_metrics(timestamp);

-- Add property viewing tracking to leads metadata
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS viewing_history JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS nurturing_status VARCHAR(50) DEFAULT 'active';

-- Create function to get tenant hierarchy
CREATE OR REPLACE FUNCTION get_tenant_hierarchy(tenant_uuid UUID)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name VARCHAR(255),
    tenant_type VARCHAR(50),
    parent_id UUID,
    level INTEGER
) AS $$
WITH RECURSIVE hierarchy AS (
    -- Base case: start with the given tenant
    SELECT 
        id as tenant_id,
        name as tenant_name,
        type as tenant_type,
        parent_tenant_id as parent_id,
        0 as level
    FROM tenants 
    WHERE id = tenant_uuid
    
    UNION ALL
    
    -- Recursive case: get children
    SELECT 
        t.id,
        t.name,
        t.type,
        t.parent_tenant_id,
        h.level + 1
    FROM tenants t
    INNER JOIN hierarchy h ON t.parent_tenant_id = h.tenant_id
)
SELECT * FROM hierarchy ORDER BY level;
$$ LANGUAGE SQL;

-- Create function to check if tenant can access lead
CREATE OR REPLACE FUNCTION can_tenant_access_lead(
    check_tenant_id UUID,
    check_lead_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    lead_tenant_id UUID;
    tenant_type VARCHAR(50);
    parent_id UUID;
BEGIN
    -- Get the lead's tenant
    SELECT tenant_id INTO lead_tenant_id 
    FROM leads 
    WHERE id = check_lead_id;
    
    -- Direct match
    IF lead_tenant_id = check_tenant_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check if checking tenant is a brokerage parent
    SELECT type, parent_tenant_id INTO tenant_type, parent_id
    FROM tenants 
    WHERE id = check_tenant_id;
    
    -- If brokerage, check if lead belongs to any of its agents
    IF tenant_type = 'brokerage' THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = check_tenant_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    -- If agent, check if lead belongs to sibling agent (same brokerage)
    IF parent_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 
            FROM tenants 
            WHERE parent_tenant_id = parent_id 
            AND id = lead_tenant_id
        );
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS if not already enabled
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS tenant_hierarchy_select ON public.tenants;
DROP POLICY IF EXISTS brokerage_lead_access ON public.leads;

-- Policy: Users can see their own tenant and children
CREATE POLICY tenant_hierarchy_select ON public.tenants
    FOR SELECT
    USING (
        id IN (
            SELECT tenant_id FROM get_tenant_hierarchy(auth.uid()::UUID)
        )
    );

-- Policy: Brokerages can see their agents' leads
CREATE POLICY brokerage_lead_access ON public.leads
    FOR SELECT
    USING (
        can_tenant_access_lead(auth.uid()::UUID, id)
    );

-- Create view for easy agent lookup
CREATE OR REPLACE VIEW brokerage_agents AS
SELECT 
    b.id as brokerage_id,
    b.name as brokerage_name,
    a.id as agent_id,
    a.name as agent_name,
    a.email as agent_email,
    a.settings->>'notification_phone' as agent_phone,
    a.created_at as joined_at
FROM tenants b
LEFT JOIN tenants a ON a.parent_tenant_id = b.id
WHERE b.type = 'brokerage'
AND (a.type = 'agent' OR a.type IS NULL);

-- Grant permissions
GRANT SELECT ON brokerage_agents TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_hierarchy TO authenticated;
GRANT EXECUTE ON FUNCTION can_tenant_access_lead TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN tenants.type IS 'Type of tenant: standalone, brokerage, or agent';
COMMENT ON COLUMN tenants.parent_tenant_id IS 'For agents, references their parent brokerage';
COMMENT ON COLUMN tenants.subdomain IS 'Unique subdomain for tenant access';
COMMENT ON TABLE phone_numbers IS 'Manages Twilio phone numbers per tenant';
COMMENT ON TABLE campaign_metrics IS 'Tracks nurturing campaign performance';
COMMENT ON FUNCTION get_tenant_hierarchy IS 'Returns full hierarchy tree for a tenant';
COMMENT ON FUNCTION can_tenant_access_lead IS 'Checks if tenant has permission to access a lead';