/**
 * CRM Sync Scheduler
 * Sets up repeatable jobs for periodic sync
 */

const QueueManager = require('../queues/QueueManager').default;

class SyncScheduler {
  /**
   * Initialize sync schedules for a tenant
   */
  static async initializeForTenant(tenantId, config = {}) {
    const {
      enableIncrementalSync = true,
      incrementalIntervalMinutes = 15,
      enableDailyFullSync = true,
      dailyFullSyncHour = 2, // 2 AM
    } = config;
    
    console.log(`⏰ Initializing sync schedule for tenant ${tenantId}`);
    
    try {
      // Schedule incremental sync every 15 minutes
      if (enableIncrementalSync) {
        await this.scheduleIncrementalSync(tenantId, incrementalIntervalMinutes);
      }
      
      // Schedule daily full sync at 2 AM
      if (enableDailyFullSync) {
        await this.scheduleDailyFullSync(tenantId, dailyFullSyncHour);
      }
      
      console.log(`✅ Sync schedules initialized for tenant ${tenantId}`);
      return true;
      
    } catch (error) {
      console.error('Error initializing sync schedules:', error);
      return false;
    }
  }
  
  /**
   * Schedule incremental sync
   */
  static async scheduleIncrementalSync(tenantId, intervalMinutes = 15) {
    const jobId = `incremental-sync-${tenantId}`;
    
    // Remove existing job if any
    await this.removeScheduledJob('lead-sync', jobId);
    
    // Add repeatable job
    const job = await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'incremental',
      sinceMinutes: intervalMinutes
    }, {
      repeat: {
        every: intervalMinutes * 60 * 1000 // Convert to milliseconds
      },
      jobId // Use consistent ID for repeatable job
    });
    
    console.log(`📅 Scheduled incremental sync every ${intervalMinutes} minutes for tenant ${tenantId}`);
    return job;
  }
  
  /**
   * Schedule daily full sync
   */
  static async scheduleDailyFullSync(tenantId, hour = 2) {
    const jobId = `daily-full-sync-${tenantId}`;
    
    // Remove existing job if any
    await this.removeScheduledJob('lead-sync', jobId);
    
    // Create cron pattern for daily at specified hour
    // Cron format: minute hour day month dayOfWeek
    const cronPattern = `0 ${hour} * * *`; // Daily at specified hour
    
    // Add repeatable job with cron
    const job = await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'full'
    }, {
      repeat: {
        cron: cronPattern,
        tz: 'America/New_York' // Adjust timezone as needed
      },
      jobId // Use consistent ID for repeatable job
    });
    
    console.log(`📅 Scheduled daily full sync at ${hour}:00 AM for tenant ${tenantId}`);
    return job;
  }
  
  /**
   * Remove scheduled job
   */
  static async removeScheduledJob(queueName, jobId) {
    try {
      const queue = QueueManager.queues[queueName];
      if (!queue) return false;
      
      // Remove repeatable job by key
      const repeatableJobs = await queue.getRepeatableJobs();
      const jobToRemove = repeatableJobs.find(job => job.id === jobId);
      
      if (jobToRemove) {
        await queue.removeRepeatableByKey(jobToRemove.key);
        console.log(`🗑️ Removed scheduled job: ${jobId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Error removing scheduled job ${jobId}:`, error);
      return false;
    }
  }
  
  /**
   * Get all scheduled sync jobs for a tenant
   */
  static async getScheduledJobs(tenantId) {
    try {
      const queue = QueueManager.queues['lead-sync'];
      if (!queue) return [];
      
      const repeatableJobs = await queue.getRepeatableJobs();
      
      // Filter jobs for this tenant
      const tenantJobs = repeatableJobs.filter(job => {
        return job.id && job.id.includes(tenantId);
      });
      
      return tenantJobs.map(job => ({
        id: job.id,
        name: job.name,
        pattern: job.cron || `Every ${job.every / 60000} minutes`,
        next: job.next ? new Date(job.next) : null,
        tz: job.tz || 'UTC'
      }));
      
    } catch (error) {
      console.error('Error getting scheduled jobs:', error);
      return [];
    }
  }
  
  /**
   * Pause all sync schedules for a tenant
   */
  static async pauseSchedules(tenantId) {
    try {
      const jobs = await this.getScheduledJobs(tenantId);
      
      for (const job of jobs) {
        await this.removeScheduledJob('lead-sync', job.id);
      }
      
      console.log(`⏸️ Paused all sync schedules for tenant ${tenantId}`);
      return true;
      
    } catch (error) {
      console.error('Error pausing schedules:', error);
      return false;
    }
  }
  
  /**
   * Resume sync schedules for a tenant
   */
  static async resumeSchedules(tenantId, config = {}) {
    return await this.initializeForTenant(tenantId, config);
  }
  
  /**
   * Initialize default schedules for all active tenants
   */
  static async initializeAllTenants() {
    try {
      const { supabase } = require('../config/supabase');
      
      if (!supabase) {
        console.warn('Supabase not configured - skipping tenant schedule initialization');
        return;
      }
      
      // Get all active tenants
      const { data: tenants, error } = await supabase
        .from('tenants')
        .select('id, settings')
        .eq('is_active', true);
      
      if (error) {
        console.error('Error fetching tenants:', error);
        return;
      }
      
      // Initialize schedules for each tenant
      for (const tenant of tenants) {
        const syncConfig = tenant.settings?.sync || {};
        await this.initializeForTenant(tenant.id, syncConfig);
      }
      
      console.log(`✅ Initialized sync schedules for ${tenants.length} tenants`);
      
    } catch (error) {
      console.error('Error initializing all tenant schedules:', error);
    }
  }
}

module.exports = SyncScheduler;