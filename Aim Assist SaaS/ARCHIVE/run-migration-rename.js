#!/usr/bin/env node

/**
 * Run migration to rename organizations table to tenants
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function runMigration() {
  console.log('🚀 Starting migration: Rename organizations to tenants\n');
  
  try {
    // First, let's check what tables exist
    console.log('📋 Checking current tables...');
    
    // Check if organizations table exists
    const { data: orgCheck, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);
    
    const hasOrganizations = !orgError || orgError.code !== 'PGRST205';
    
    // Check if tenants table exists
    const { data: tenantCheck, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .limit(1);
    
    const hasTenants = !tenantError || tenantError.code !== 'PGRST205';
    
    console.log(`   • organizations table: ${hasOrganizations ? '✅ exists' : '❌ not found'}`);
    console.log(`   • tenants table: ${hasTenants ? '✅ exists' : '❌ not found'}`);
    
    if (hasTenants && !hasOrganizations) {
      console.log('\n✅ Already migrated! tenants table exists.');
      return;
    }
    
    if (!hasOrganizations && !hasTenants) {
      console.log('\n⚠️  No organizations or tenants table found. Creating tenants table...');
      
      // Create tenants table from scratch
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          organization_id UUID,
          crm_type VARCHAR(50) DEFAULT 'fub',
          is_active BOOLEAN DEFAULT true,
          settings JSONB DEFAULT '{}',
          subscription_plan VARCHAR(50) DEFAULT 'trial',
          user_id UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Create demo tenant
        INSERT INTO tenants (id, name, organization_id, crm_type, is_active, settings)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Demo Tenant',
          '655cd229-b2e9-4737-843b-7488fe9d33e6',
          'fub',
          true,
          '{"agency_name": "Demo Agency"}'
        ) ON CONFLICT (id) DO NOTHING;
      `;
      
      // Execute via RPC or direct SQL would be needed here
      // For now, let's just note what needs to be done
      console.log('\n📝 Please run this SQL in Supabase SQL editor:');
      console.log(createTableSQL);
      
      return;
    }
    
    if (hasOrganizations) {
      console.log('\n⚠️  Migration requires direct SQL access.');
      console.log('📝 Please run the following SQL in Supabase SQL editor:\n');
      
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, 'migrations/013_rename_organizations_to_tenants.sql'),
        'utf8'
      );
      
      console.log('```sql');
      console.log(migrationSQL.substring(0, 500) + '...\n[Full migration in migrations/013_rename_organizations_to_tenants.sql]');
      console.log('```');
      
      console.log('\n📌 Or copy this simplified version:');
      console.log('```sql');
      console.log('ALTER TABLE organizations RENAME TO tenants;');
      console.log('ALTER TABLE leads RENAME COLUMN organization_id TO tenant_id;');
      console.log('ALTER TABLE agents RENAME COLUMN organization_id TO tenant_id;');
      console.log('ALTER TABLE conversations RENAME COLUMN organization_id TO tenant_id;');
      console.log('ALTER TABLE messages RENAME COLUMN organization_id TO tenant_id;');
      console.log('```');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runMigration().then(() => {
  console.log('\n✨ Migration check complete!');
}).catch(console.error);