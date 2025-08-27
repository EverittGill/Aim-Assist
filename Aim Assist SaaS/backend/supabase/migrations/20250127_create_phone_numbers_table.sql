-- Migration: Create Phone Numbers Table
-- Date: 2025-01-27
-- Purpose: Map phone numbers to organizations for webhook routing

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  type VARCHAR(50) DEFAULT 'twilio',
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{"sms": true, "voice": false, "mms": false}'::jsonb,
  provider_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, phone_number)
);

-- Create indexes for performance
CREATE INDEX idx_phone_numbers_org ON phone_numbers(organization_id);
CREATE INDEX idx_phone_numbers_phone ON phone_numbers(phone_number);
CREATE INDEX idx_phone_numbers_active ON phone_numbers(is_active) WHERE is_active = true;

-- Add comments for documentation
COMMENT ON TABLE phone_numbers IS 'Maps phone numbers to organizations for message routing';
COMMENT ON COLUMN phone_numbers.organization_id IS 'Organization that owns this phone number';
COMMENT ON COLUMN phone_numbers.phone_number IS 'Phone number in E.164 format (e.g., +18662981158)';
COMMENT ON COLUMN phone_numbers.type IS 'Provider type: twilio, telnyx, etc';
COMMENT ON COLUMN phone_numbers.is_primary IS 'Is this the primary number for the organization';
COMMENT ON COLUMN phone_numbers.is_active IS 'Is this number currently active';
COMMENT ON COLUMN phone_numbers.capabilities IS 'What this number can do: sms, voice, mms';
COMMENT ON COLUMN phone_numbers.provider_config IS 'Provider-specific configuration';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();