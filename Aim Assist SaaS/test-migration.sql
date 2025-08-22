
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
