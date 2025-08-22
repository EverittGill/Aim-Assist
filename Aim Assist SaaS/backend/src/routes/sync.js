/**
 * CRM Sync Management API Routes
 * Handles manual sync triggers and status checks
 */

const express = require('express');
const router = express.Router();
const CRMSyncService = require('../services/CRMSyncService');
const QueueManager = require('../queues/QueueManager').default;

/**
 * Trigger full sync of all leads from CRM
 * POST /api/sync/full
 */
router.post('/full', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1'; // Demo tenant
    
    console.log(`📥 Full sync requested for tenant ${tenantId}`);
    
    // Queue the sync job
    const job = await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'full'
    });
    
    res.json({
      success: true,
      message: 'Full sync queued',
      job_id: job.id,
      tenant_id: tenantId
    });
  } catch (error) {
    console.error('Error queuing full sync:', error);
    res.status(500).json({
      error: 'Failed to queue sync',
      message: error.message
    });
  }
});

/**
 * Trigger incremental sync of recent changes
 * POST /api/sync/incremental
 */
router.post('/incremental', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const sinceMinutes = req.body.since_minutes || 15;
    
    console.log(`📥 Incremental sync requested for tenant ${tenantId} (last ${sinceMinutes} minutes)`);
    
    // Queue the sync job
    const job = await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'incremental',
      sinceMinutes
    });
    
    res.json({
      success: true,
      message: 'Incremental sync queued',
      job_id: job.id,
      tenant_id: tenantId,
      since_minutes: sinceMinutes
    });
  } catch (error) {
    console.error('Error queuing incremental sync:', error);
    res.status(500).json({
      error: 'Failed to queue sync',
      message: error.message
    });
  }
});

/**
 * Sync a specific lead by CRM ID
 * POST /api/sync/lead/:id
 */
router.post('/lead/:id', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const leadId = req.params.id;
    
    console.log(`📥 Single lead sync requested: ${leadId} for tenant ${tenantId}`);
    
    const syncService = new CRMSyncService(tenantId);
    const result = await syncService.syncSingleLead(leadId);
    
    res.json({
      success: true,
      message: `Lead ${leadId} synced`,
      stats: result
    });
  } catch (error) {
    console.error(`Error syncing lead ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to sync lead',
      message: error.message
    });
  }
});

/**
 * Get sync status and history
 * GET /api/sync/status
 */
router.get('/status', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    
    const status = await CRMSyncService.getSyncStatus(tenantId);
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      error: 'Failed to get sync status',
      message: error.message
    });
  }
});

/**
 * Get sync history
 * GET /api/sync/history
 */
router.get('/history', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const limit = parseInt(req.query.limit) || 10;
    
    const history = await CRMSyncService.getSyncHistory(tenantId, limit);
    
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({
      error: 'Failed to get sync history',
      message: error.message
    });
  }
});

/**
 * Execute sync immediately (not queued)
 * POST /api/sync/execute
 * For testing and development
 */
router.post('/execute', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const syncType = req.body.sync_type || 'full';
    
    console.log(`🚀 Executing ${syncType} sync immediately for tenant ${tenantId}`);
    
    const syncService = new CRMSyncService(tenantId);
    
    let result;
    if (syncType === 'incremental') {
      result = await syncService.incrementalSync(req.body.since_minutes || 15);
    } else {
      result = await syncService.fullSync();
    }
    
    res.json({
      success: true,
      message: `${syncType} sync completed`,
      stats: result
    });
  } catch (error) {
    console.error('Error executing sync:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

/**
 * Get queue status for sync jobs
 * GET /api/sync/queue
 */
router.get('/queue', async (req, res) => {
  try {
    const stats = await QueueManager.getQueueStats('lead-sync');
    
    res.json({
      success: true,
      queue: 'lead-sync',
      stats
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

module.exports = router;