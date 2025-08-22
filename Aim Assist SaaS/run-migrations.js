#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Aim Assist SaaS - Database Migration Tool\n');

const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${migrationFiles.length} migration files:\n`);

let combinedSQL = `-- ========================================
-- Aim Assist SaaS - Complete Database Setup
-- Generated: ${new Date().toISOString()}
-- ========================================
-- 
-- Run this entire script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qjuajqqchqxjxntofdoz/sql/new
--
-- This will create all tables with proper multi-tenant isolation
-- ========================================

`;

migrationFiles.forEach((file, index) => {
  console.log(`  ${index + 1}. ${file}`);
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  
  combinedSQL += `
-- ========================================
-- Migration ${index + 1}: ${file}
-- ========================================

${content}

`;
});

// Save combined SQL
const outputFile = path.join(__dirname, 'combined-migrations.sql');
fs.writeFileSync(outputFile, combinedSQL);

console.log('\n✅ Combined migration script created: combined-migrations.sql');
console.log('\n📋 Next steps:');
console.log('1. Go to: https://supabase.com/dashboard/project/qjuajqqchqxjxntofdoz/sql/new');
console.log('2. Copy the contents of combined-migrations.sql');
console.log('3. Paste and run in the SQL editor');
console.log('4. Check the "Success" message for each table created');
console.log('\n⚠️  Important: Run the ENTIRE script at once for proper setup');

// Also create a test script
const testScript = `
-- Test Script - Run AFTER migrations
-- This verifies the setup worked correctly

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Insert test tenant
INSERT INTO tenants (name, subdomain, subscription_status)
VALUES ('Test Company', 'test-company', 'trial')
RETURNING id, name, subdomain;

-- Count all tables
SELECT 
  (SELECT COUNT(*) FROM tenants) as tenants,
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM crm_integrations) as crm_integrations,
  (SELECT COUNT(*) FROM leads) as leads,
  (SELECT COUNT(*) FROM conversations) as conversations,
  (SELECT COUNT(*) FROM messages) as messages;
`;

fs.writeFileSync(path.join(__dirname, 'test-migration.sql'), testScript);
console.log('\n🧪 Test script created: test-migration.sql');
console.log('   Run this after migrations to verify everything works');