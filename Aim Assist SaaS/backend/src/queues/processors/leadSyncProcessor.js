/**
 * Processes lead sync jobs
 * Syncs leads from CRM to local database with comprehensive data extraction
 */

const CRMSyncService = require('../../services/CRMSyncService');

module.exports = async function processLeadSync(job) {
  const { tenantId, syncType = 'full', sinceMinutes = 15 } = job.data;
  
  console.log(`🔄 Processing ${syncType} lead sync job ${job.id} for tenant ${tenantId}`);
  
  try {
    const syncService = new CRMSyncService(tenantId);
    
    let result;
    if (syncType === 'incremental') {
      result = await syncService.incrementalSync(sinceMinutes);
    } else if (syncType === 'single' && job.data.leadId) {
      result = await syncService.syncSingleLead(job.data.leadId);
    } else {
      result = await syncService.fullSync();
    }
    
    console.log(`✅ Lead sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error(`❌ Lead sync job ${job.id} failed:`, error);
    throw error;
  }
};