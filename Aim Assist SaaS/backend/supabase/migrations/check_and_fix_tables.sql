-- Check existing tables and add missing columns if needed

-- First, let's see what tables already exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sync_history', 'usage_metrics', 'extraction_logs', 'crm_integrations', 'audit_logs');

-- Check if crm_integrations exists and what columns it has
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'crm_integrations' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- If crm_integrations exists but is missing is_primary column, add it
DO $$
BEGIN
  -- Add is_primary column if it doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_integrations') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'is_primary') THEN
    ALTER TABLE crm_integrations ADD COLUMN is_primary BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added is_primary column to crm_integrations table';
  END IF;
  
  -- Add other potentially missing columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_integrations') THEN
    -- Add sync_frequency_minutes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'sync_frequency_minutes') THEN
      ALTER TABLE crm_integrations ADD COLUMN sync_frequency_minutes INTEGER DEFAULT 15;
    END IF;
    
    -- Add last_sync_status if missing  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'last_sync_status') THEN
      ALTER TABLE crm_integrations ADD COLUMN last_sync_status VARCHAR(50);
    END IF;
    
    -- Add capabilities if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'capabilities') THEN
      ALTER TABLE crm_integrations ADD COLUMN capabilities JSONB DEFAULT '{}';
    END IF;
    
    -- Add field_mappings if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'field_mappings') THEN
      ALTER TABLE crm_integrations ADD COLUMN field_mappings JSONB DEFAULT '{}';
    END IF;
    
    -- Add sync_settings if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_integrations' AND column_name = 'sync_settings') THEN
      ALTER TABLE crm_integrations ADD COLUMN sync_settings JSONB DEFAULT '{}';
    END IF;
  END IF;
END $$;