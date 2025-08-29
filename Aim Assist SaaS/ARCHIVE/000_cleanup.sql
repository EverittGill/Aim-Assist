-- Cleanup script to remove existing schema before fresh migration
-- Run this FIRST if you get "already exists" errors

-- Drop all existing policies
DROP POLICY IF EXISTS tenant_isolation ON tenants;
DROP POLICY IF EXISTS user_tenant_isolation ON users;
DROP POLICY IF EXISTS crm_tenant_isolation ON crm_integrations;
DROP POLICY IF EXISTS channel_tenant_isolation ON communication_channels;
DROP POLICY IF EXISTS lead_tenant_isolation ON leads;
DROP POLICY IF EXISTS conversation_tenant_isolation ON conversations;
DROP POLICY IF EXISTS message_tenant_isolation ON messages;
DROP POLICY IF EXISTS ai_config_tenant_isolation ON ai_configurations;
DROP POLICY IF EXISTS automation_tenant_isolation ON automation_rules;
DROP POLICY IF EXISTS activity_read_isolation ON activity_logs;
DROP POLICY IF EXISTS activity_insert_isolation ON activity_logs;
DROP POLICY IF EXISTS usage_tenant_isolation ON usage_tracking;
DROP POLICY IF EXISTS webhook_tenant_isolation ON webhook_logs;

-- Drop all triggers
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_crm_integrations_updated_at ON crm_integrations;
DROP TRIGGER IF EXISTS update_communication_channels_updated_at ON communication_channels;
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS update_ai_configurations_updated_at ON ai_configurations;
DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON automation_rules;
DROP TRIGGER IF EXISTS normalize_lead_phone_trigger ON leads;
DROP TRIGGER IF EXISTS update_conversation_metrics_trigger ON messages;

-- Drop all functions
DROP FUNCTION IF EXISTS auth.tenant_id();
DROP FUNCTION IF EXISTS public.get_tenant_id();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS normalize_phone_number(TEXT);
DROP FUNCTION IF EXISTS normalize_lead_phone();
DROP FUNCTION IF EXISTS update_conversation_metrics();

-- Drop all indexes
DROP INDEX IF EXISTS idx_tenants_slug;
DROP INDEX IF EXISTS idx_tenants_stripe_customer;
DROP INDEX IF EXISTS idx_tenants_is_active;
DROP INDEX IF EXISTS idx_users_tenant_id;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_supabase_auth_id;
DROP INDEX IF EXISTS idx_users_tenant_email;
DROP INDEX IF EXISTS idx_leads_tenant_id;
DROP INDEX IF EXISTS idx_leads_external_id;
DROP INDEX IF EXISTS idx_leads_phone;
DROP INDEX IF EXISTS idx_leads_email;
DROP INDEX IF EXISTS idx_leads_ai_status;
DROP INDEX IF EXISTS idx_leads_assigned_user;
DROP INDEX IF EXISTS idx_leads_do_not_contact;
DROP INDEX IF EXISTS idx_leads_tenant_phone;
DROP INDEX IF EXISTS idx_messages_tenant_id;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_messages_lead_id;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_external_id;
DROP INDEX IF EXISTS idx_messages_status;
DROP INDEX IF EXISTS idx_conversations_tenant_id;
DROP INDEX IF EXISTS idx_conversations_lead_id;
DROP INDEX IF EXISTS idx_conversations_status;
DROP INDEX IF EXISTS idx_conversations_last_message;
DROP INDEX IF EXISTS idx_activity_logs_tenant_id;
DROP INDEX IF EXISTS idx_activity_logs_user_id;
DROP INDEX IF EXISTS idx_activity_logs_created_at;
DROP INDEX IF EXISTS idx_activity_logs_entity;
DROP INDEX IF EXISTS idx_usage_tracking_tenant_id;
DROP INDEX IF EXISTS idx_usage_tracking_created_at;
DROP INDEX IF EXISTS idx_usage_tracking_metric_type;
DROP INDEX IF EXISTS idx_usage_tracking_unbilled;
DROP INDEX IF EXISTS idx_webhook_logs_tenant_id;
DROP INDEX IF EXISTS idx_webhook_logs_created_at;
DROP INDEX IF EXISTS idx_webhook_logs_unprocessed;

-- Drop all tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS usage_tracking CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS ai_configurations CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS communication_channels CASCADE;
DROP TABLE IF EXISTS crm_integrations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ CLEANUP COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'All existing schema objects have been removed.';
    RAISE NOTICE 'You can now run the fresh migration.';
    RAISE NOTICE '';
END $$;