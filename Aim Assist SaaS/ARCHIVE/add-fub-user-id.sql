-- Add FUB user_id to the credentials so messages show up properly in FUB
UPDATE crm_integrations 
SET credentials = credentials || '{"user_id": "1"}'::jsonb
WHERE tenant_id = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1'
AND crm_type = 'followupboss';

-- Verify it was added
SELECT 
  credentials->>'user_id' as fub_user_id,
  credentials->>'api_key' as has_api_key
FROM crm_integrations
WHERE tenant_id = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';