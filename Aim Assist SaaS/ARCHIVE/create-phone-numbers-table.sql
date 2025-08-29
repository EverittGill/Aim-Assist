-- Create phone_numbers table for multi-tenant phone routing
-- This is CRITICAL for proper message routing to correct tenants

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Phone details
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  friendly_name VARCHAR(100),
  
  -- Provider details  
  provider VARCHAR(50) DEFAULT 'twilio',
  provider_sid VARCHAR(100),
  capabilities JSONB DEFAULT '{"sms": true, "mms": true, "voice": false}'::jsonb,
  
  -- Usage
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  purpose VARCHAR(50) DEFAULT 'general',
  
  -- Costs
  monthly_cost DECIMAL(10,2),
  
  -- Metadata
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_active ON phone_numbers(phone_number, is_active);

-- Insert your test phone number
INSERT INTO phone_numbers (
  tenant_id,
  phone_number,
  friendly_name,
  is_primary,
  is_active,
  provider
) VALUES (
  '7c563f31-36bd-4414-ad44-ef9c19c1c6b1',  -- Your tenant ID
  '+18662981158',                           -- Your Twilio number
  'Everitt Test Number',
  true,
  true,
  'twilio'
) ON CONFLICT (phone_number) 
DO UPDATE SET 
  tenant_id = EXCLUDED.tenant_id,
  is_primary = EXCLUDED.is_primary,
  is_active = EXCLUDED.is_active;

-- Verify it was created
SELECT 
  phone_number,
  tenant_id,
  is_primary,
  is_active
FROM phone_numbers
WHERE phone_number = '+18662981158';