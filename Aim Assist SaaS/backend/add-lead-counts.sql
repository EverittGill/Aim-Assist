-- Add lead count view to see how many leads each tenant has
-- Run this in Supabase SQL Editor

-- Create a view that shows tenants with their lead counts
CREATE OR REPLACE VIEW public.tenants_with_stats AS
SELECT 
    t.*,
    COALESCE(lead_counts.total_leads, 0) as total_leads,
    COALESCE(lead_counts.active_leads, 0) as active_leads,
    COALESCE(lead_counts.with_phone, 0) as leads_with_phone,
    COALESCE(lead_counts.ai_enabled, 0) as ai_enabled_leads
FROM tenants t
LEFT JOIN (
    SELECT 
        tenant_id,
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status != 'archived' THEN 1 END) as active_leads,
        COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone,
        COUNT(CASE WHEN ai_status = 'active' THEN 1 END) as ai_enabled
    FROM leads
    GROUP BY tenant_id
) lead_counts ON t.id = lead_counts.tenant_id;

-- Grant permissions
GRANT SELECT ON tenants_with_stats TO service_role;
GRANT SELECT ON tenants_with_stats TO authenticated;

-- Optional: Add a function to get tenant stats
CREATE OR REPLACE FUNCTION get_tenant_stats(p_tenant_id UUID)
RETURNS TABLE (
    total_leads BIGINT,
    active_leads BIGINT,
    leads_with_phone BIGINT,
    ai_enabled_leads BIGINT,
    leads_with_tags BIGINT,
    last_sync_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN l.status != 'archived' THEN 1 END) as active_leads,
        COUNT(CASE WHEN l.phone IS NOT NULL AND l.phone != '' THEN 1 END) as leads_with_phone,
        COUNT(CASE WHEN l.ai_status = 'active' THEN 1 END) as ai_enabled_leads,
        COUNT(CASE WHEN array_length(l.tags, 1) > 0 THEN 1 END) as leads_with_tags,
        MAX(l.last_synced_at) as last_sync_at
    FROM leads l
    WHERE l.tenant_id = p_tenant_id;
END;
$$;

-- Success message
SELECT 'Lead count views and functions created successfully!' as status;