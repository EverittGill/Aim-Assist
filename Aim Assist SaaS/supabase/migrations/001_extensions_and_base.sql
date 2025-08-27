-- Migration 001: Extensions and Base Setup
-- Balanced approach: Only essential extensions and types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Simple ENUM types (only what we know we need)
CREATE TYPE subscription_plan AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE user_role AS ENUM (
  'owner',
  'admin',
  'agent'
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

-- Helper function for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper function for phone normalization
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-numeric characters
  cleaned := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- Handle US numbers
  IF length(cleaned) = 10 THEN
    cleaned := '1' || cleaned;
  END IF;
  
  IF length(cleaned) = 11 AND substring(cleaned, 1, 1) = '1' THEN
    RETURN '+' || cleaned;
  END IF;
  
  -- Return original if can't normalize
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_phone IS 'Normalize phone numbers to E.164 format';