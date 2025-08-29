-- First, let's see what columns the phone_numbers table actually has
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'phone_numbers'
ORDER BY ordinal_position;

-- Insert your phone mapping (without friendly_name since it doesn't exist)
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
  is_active = EXCLUDED.is_active;

-- Verify it was inserted
SELECT 
  phone_number,
  tenant_id,
  is_primary,
  is_active
FROM phone_numbers
WHERE phone_number = '+18662981158';