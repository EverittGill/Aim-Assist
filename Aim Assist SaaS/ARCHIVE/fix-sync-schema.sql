-- Fix database schema for comprehensive CRM sync
-- Run this in Supabase SQL Editor

-- First, check if external_id exists and rename it to crm_lead_id
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'leads' AND column_name = 'external_id') THEN
        ALTER TABLE leads RENAME COLUMN external_id TO crm_lead_id;
    END IF;
END $$;

-- Ensure crm_lead_id exists (in case it was already renamed or added)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_lead_id VARCHAR(255);

-- Add missing sync tracking fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_user_crm_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS background TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add fields for comprehensive FUB data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS addresses JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_communication JSONB DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_created_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_updated_at TIMESTAMPTZ;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_leads_sync ON leads(tenant_id, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_leads_sync_status ON leads(tenant_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_leads_crm_updated ON leads(tenant_id, crm_updated_at DESC);

-- Create sync history table for tracking sync operations
CREATE TABLE IF NOT EXISTS public.sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Sync Details
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'webhook', 'manual'
    sync_status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed'
    crm_type VARCHAR(50) NOT NULL,
    
    -- Statistics
    leads_fetched INTEGER DEFAULT 0,
    leads_created INTEGER DEFAULT 0,
    leads_updated INTEGER DEFAULT 0,
    leads_failed INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Error Tracking
    error_message TEXT,
    error_details JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for sync history
CREATE INDEX idx_sync_history_tenant ON sync_history (tenant_id, started_at DESC);

-- Update leads table to ensure we can handle the unique constraint properly
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_tenant_id_external_id_crm_type_key;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_tenant_id_crm_lead_id_crm_type_key;
ALTER TABLE leads ADD CONSTRAINT leads_tenant_crm_unique 
    UNIQUE(tenant_id, crm_lead_id, crm_type);

-- Grant permissions
GRANT ALL ON sync_history TO service_role;

-- Enable RLS
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for sync history
CREATE POLICY tenant_isolation_sync_history ON sync_history
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Success message
SELECT 'Sync schema updated successfully! Ready for comprehensive CRM sync.' as status;