-- Fix phone_numbers table unique constraint issue
-- This adds the missing unique constraint that the ON CONFLICT clause needs

-- First check if the constraint already exists
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'phone_numbers'
  AND constraint_type = 'UNIQUE';

-- Add unique constraint if it doesn't exist
-- Note: This might fail if there are duplicate phone numbers already
ALTER TABLE phone_numbers 
ADD CONSTRAINT phone_numbers_phone_unique UNIQUE (phone_number);

-- Now insert your phone mapping
INSERT INTO phone_numbers (
  tenant_id,
  phone_number,
  is_primary,
  is_active
) VALUES (
  '7c563f31-36bd-4414-ad44-ef9c19c1c6b1',  -- Your tenant ID
  '+18662981158',                           -- Your Twilio number
  true,
  true
) ON CONFLICT (phone_number) 
DO UPDATE SET 
  tenant_id = EXCLUDED.tenant_id,
  is_primary = EXCLUDED.is_primary,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify it was inserted
SELECT 
  phone_number,
  tenant_id,
  is_primary,
  is_active
FROM phone_numbers
WHERE phone_number = '+18662981158';