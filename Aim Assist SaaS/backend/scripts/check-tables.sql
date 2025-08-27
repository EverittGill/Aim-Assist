-- Check if tables exist and their structure
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('crm_integrations', 'extraction_logs', 'lead_qualifications', 'usage_metrics')
ORDER BY table_name, ordinal_position;