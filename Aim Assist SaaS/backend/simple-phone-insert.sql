-- Simple insert without ON CONFLICT (no unique constraint required)
-- Use this if the constraint addition fails

-- First, delete any existing entry for this phone
DELETE FROM phone_numbers 
WHERE phone_number = '+18662981158';

-- Now insert fresh
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
);

-- Verify it was inserted
SELECT 
  phone_number,
  tenant_id,
  is_primary,
  is_active
FROM phone_numbers
WHERE phone_number = '+18662981158';