-- Insert CRM integration for our test tenant
INSERT INTO crm_integrations (
  tenant_id,
  crm_type,
  is_active,
  is_primary,
  last_sync_status
) VALUES (
  'e5669fe6-a161-4628-89e3-4b8e01f663b8', -- Everitt's tenant
  'fub',
  true,
  true,
  'ready'
) ON CONFLICT (tenant_id, crm_type) 
DO UPDATE SET 
  is_active = true,
  is_primary = true,
  last_sync_status = 'ready';

-- Also update tenant's crm_type
UPDATE tenants 
SET crm_type = 'fub'
WHERE id = 'e5669fe6-a161-4628-89e3-4b8e01f663b8';

-- Verify the insert
SELECT * FROM crm_integrations WHERE tenant_id = 'e5669fe6-a161-4628-89e3-4b8e01f663b8';