-- Run this in Supabase SQL Editor
-- Project: oortuqnectzpqpboywfq
-- URL: https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql/new

-- Migration 001: Enable Extensions and Create ENUMs
-- Purpose: Set up foundational database extensions and types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite GIN indexes

-- Create ENUM types for consistent status values
CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active', 
  'past_due',
  'canceled',
  'paused'
);

CREATE TYPE subscription_plan AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise',
  'custom'
);

CREATE TYPE crm_type AS ENUM (
  'fub',           -- Follow Up Boss
  'lofty',         -- Lofty (formerly Chime)
  'pipedrive',     -- Pipedrive
  'salesforce',    -- Salesforce
  'hubspot',       -- HubSpot
  'kvcore',        -- KvCore
  'liondesk',      -- LionDesk
  'custom'         -- Custom CRM
);

CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE sender_type AS ENUM (
  'lead',
  'ai',
  'agent',
  'system'
);

CREATE TYPE conversation_status AS ENUM (
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE qualification_status AS ENUM (
  'not_qualified',
  'partially_qualified',
  'qualified',
  'disqualified'
);

CREATE TYPE ai_provider AS ENUM (
  'claude',
  'openai',
  'gemini',
  'custom'
);

-- Create a simple test to verify extensions are enabled
CREATE OR REPLACE FUNCTION test_extensions()
RETURNS TABLE (
  extension_name text,
  is_installed boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ext.extname::text,
    true as is_installed
  FROM pg_extension ext
  WHERE ext.extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin')
  ORDER BY ext.extname;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TYPE subscription_status IS 'Subscription status for tenant billing';
COMMENT ON TYPE subscription_plan IS 'Available subscription tiers';
COMMENT ON TYPE crm_type IS 'Supported CRM integrations';
COMMENT ON TYPE message_direction IS 'SMS message direction';
COMMENT ON TYPE sender_type IS 'Type of message sender';
COMMENT ON TYPE conversation_status IS 'Conversation lifecycle status';
COMMENT ON TYPE qualification_status IS 'Lead qualification status';
COMMENT ON TYPE ai_provider IS 'AI service providers for text generation';