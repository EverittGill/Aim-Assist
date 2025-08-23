-- Migration: 008_security_fixes.sql
-- Purpose: Fix security issues identified by Supabase linter
-- Date: 2025-01-22

-- =====================================================
-- 1. Enable RLS on campaign_metrics table
-- =====================================================
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for campaign_metrics
CREATE POLICY campaign_metrics_tenant_isolation ON public.campaign_metrics
    FOR ALL
    USING (tenant_id = auth.uid()::UUID OR 
           tenant_id IN (SELECT id FROM tenants WHERE parent_tenant_id = auth.uid()::UUID));

-- =====================================================
-- 2. Fix the brokerage_agents view (remove SECURITY DEFINER)
-- =====================================================
DROP VIEW IF EXISTS brokerage_agents;

CREATE VIEW brokerage_agents AS
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

-- =====================================================
-- 3. Fix function search paths for security
-- =====================================================

-- Fix get_tenant_hierarchy function
CREATE OR REPLACE FUNCTION get_tenant_hierarchy(tenant_uuid UUID)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name VARCHAR(255),
    tenant_type VARCHAR(50),
    parent_id UUID,
    level INTEGER
) 
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Fix can_tenant_access_lead function
CREATE OR REPLACE FUNCTION can_tenant_access_lead(
    check_tenant_id UUID,
    check_lead_id UUID
) RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Fix other functions mentioned in warnings
CREATE OR REPLACE FUNCTION get_tenant_id(tenant_slug text)
RETURNS UUID 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM tenants WHERE slug = tenant_slug;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_phone_number(phone text)
RETURNS text 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Remove all non-numeric characters
    phone := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Add country code if missing (assuming US)
    IF length(phone) = 10 THEN
        phone := '1' || phone;
    END IF;
    
    -- Add + prefix
    IF NOT phone ~ '^[+]' THEN
        phone := '+' || phone;
    END IF;
    
    RETURN phone;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_lead_phone()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone_number(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_conversation_metrics()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update conversation metrics when messages are added
    UPDATE conversations 
    SET 
        message_count = (
            SELECT COUNT(*) 
            FROM messages 
            WHERE conversation_id = NEW.conversation_id
        ),
        last_message_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. Move pg_trgm extension to extensions schema
-- =====================================================
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Try to move the extension (this might fail if extension is in use)
-- If it fails, you may need to recreate indexes after moving
DO $$
BEGIN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
EXCEPTION
    WHEN OTHERS THEN
        -- If moving fails, at least document it
        RAISE NOTICE 'Could not move pg_trgm extension. Manual intervention may be needed: %', SQLERRM;
END $$;

-- =====================================================
-- 5. Add missing RLS policies for other tables if needed
-- =====================================================

-- Enable RLS on phone_numbers table
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY phone_numbers_tenant_isolation ON public.phone_numbers
    FOR ALL
    USING (tenant_id = auth.uid()::UUID OR 
           tenant_id IN (SELECT id FROM tenants WHERE parent_tenant_id = auth.uid()::UUID));

-- =====================================================
-- Verification
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Security fixes applied:';
    RAISE NOTICE '  - RLS enabled on campaign_metrics and phone_numbers';
    RAISE NOTICE '  - Functions updated with secure search_path';
    RAISE NOTICE '  - brokerage_agents view recreated without SECURITY DEFINER';
    RAISE NOTICE '  - Extension migration attempted (check manually if failed)';
END $$;