/**
 * Script to sync leads from CRM to Supabase
 * Performs a full sync to populate the database
 */

// Load environment variables first
require('dotenv').config({ path: __dirname + '/../.env' });

const CRMSyncService = require('../src/services/CRMSyncService');

async function syncLeads() {
  const tenantId = 'e5669fe6-a161-4628-89e3-4b8e01f663b8'; // Your tenant ID
  
  console.log('🔄 Starting full lead sync for tenant:', tenantId);
  
  try {
    const syncService = new CRMSyncService(tenantId);
    const results = await syncService.fullSync();
    
    console.log('✅ Sync completed successfully!');
    console.log('📊 Results:', results);
    
    return results;
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// Run the sync
syncLeads().then(() => {
  console.log('🎉 Lead sync complete!');
  process.exit(0);
}).catch(error => {
  console.error('Failed to sync leads:', error);
  process.exit(1);
});