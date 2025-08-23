-- Migration: 009_add_user_id_to_tenants.sql
-- Purpose: Add user_id column to tenants table for proper auth integration
-- Date: 2025-01-22
-- Description: This migration bridges the gap between Supabase auth and our tenant system
--              by adding a direct link from tenants to auth users

-- Add user_id column to link tenants to Supabase auth users
-- This is for the primary owner/creator of the tenant
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS twilio_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS lead_tags TEXT[] DEFAULT ARRAY['Direct Connect', 'PPC'];

-- Create index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN tenants.user_id IS 'Primary owner user from Supabase auth - used for initial tenant creation and ownership';
COMMENT ON COLUMN tenants.twilio_phone IS 'Twilio phone number for sending SMS';
COMMENT ON COLUMN tenants.notification_phone IS 'Phone number to receive notifications';
COMMENT ON COLUMN tenants.lead_tags IS 'Tags to filter leads for auto-text functionality';

-- Update RLS policies to allow users to see their own tenant
DROP POLICY IF EXISTS tenants_user_access ON tenants;
CREATE POLICY tenants_user_access ON tenants
    FOR ALL
    USING (
        user_id = auth.uid() OR 
        id IN (
            SELECT tenant_id FROM users WHERE auth_id = auth.uid()
        )
    );

-- Ensure the policy is enabled
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;