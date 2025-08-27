-- Migration: Rename organizations to tenants
-- This aligns the database with the codebase which uses 'tenants' throughout

-- 1. Rename the organizations table to tenants
ALTER TABLE IF EXISTS organizations RENAME TO tenants;

-- 2. Rename organization_id foreign key columns to tenant_id
ALTER TABLE IF EXISTS leads RENAME COLUMN organization_id TO tenant_id;
ALTER TABLE IF EXISTS agents RENAME COLUMN organization_id TO tenant_id;
ALTER TABLE IF EXISTS conversations RENAME COLUMN organization_id TO tenant_id;
ALTER TABLE IF EXISTS messages RENAME COLUMN organization_id TO tenant_id;
ALTER TABLE IF EXISTS phone_numbers RENAME COLUMN organization_id TO tenant_id;

-- 3. Update any indexes that reference organization_id
DROP INDEX IF EXISTS idx_leads_organization;
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);

DROP INDEX IF EXISTS idx_agents_organization;
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);

DROP INDEX IF EXISTS idx_conversations_organization;
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);

DROP INDEX IF EXISTS idx_messages_organization;
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);

DROP INDEX IF EXISTS idx_phone_numbers_organization;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant ON phone_numbers(tenant_id);

-- 4. Update foreign key constraints
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_organization_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_organization_id_fkey;
ALTER TABLE agents ADD CONSTRAINT agents_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_organization_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_organization_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_organization_id_fkey;
ALTER TABLE phone_numbers ADD CONSTRAINT phone_numbers_tenant_id_fkey 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 5. Update RLS policies to use correct table name
-- Drop old policies
DROP POLICY IF EXISTS "Organizations are viewable by members" ON tenants;
DROP POLICY IF EXISTS "Organizations are editable by members" ON tenants;

-- Create new policies
CREATE POLICY "Tenants are viewable by members" ON tenants
  FOR SELECT USING (true); -- Adjust based on your auth model

CREATE POLICY "Tenants are editable by members" ON tenants
  FOR UPDATE USING (true); -- Adjust based on your auth model

-- 6. Add any missing columns that our code expects
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE tenants SET organization_id = id WHERE organization_id IS NULL;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_type VARCHAR(50) DEFAULT 'fub';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 7. Ensure the tenants table has all needed columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'trial';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS user_id UUID;

-- Migration complete
COMMENT ON TABLE tenants IS 'Multi-tenant organizations (renamed from organizations)';