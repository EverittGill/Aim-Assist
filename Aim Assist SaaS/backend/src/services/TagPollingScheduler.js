/**
 * Tag Polling Scheduler
 * Sets up repeatable jobs for polling specific tags
 */

const QueueManager = require('../queues/QueueManager').default;

class TagPollingScheduler {
  /**
   * Initialize tag polling for a tenant
   */
  static async initializeForTenant(tenantId, tagConfigs = []) {
    console.log(`⏰ Initializing tag polling schedules for tenant ${tenantId}`);
    
    try {
      // Default configuration for AIM_ASSIST if no configs provided
      if (tagConfigs.length === 0) {
        tagConfigs = [{
          tagName: 'AIM_ASSIST',
          intervalMinutes: 3,
          processImmediately: true,
          enableAI: true,
          sendAutoText: true
        }];
      }
      
      // Set up polling for each tag
      for (const config of tagConfigs) {
        await this.scheduleTagPolling(tenantId, config);
      }
      
      console.log(`✅ Tag polling schedules initialized for ${tagConfigs.length} tags`);
      return true;
      
    } catch (error) {
      console.error('Error initializing tag polling schedules:', error);
      return false;
    }
  }
  
  /**
   * Schedule polling for a specific tag
   */
  static async scheduleTagPolling(tenantId, config) {
    const {
      tagName,
      intervalMinutes = 3,
      processImmediately = true,
      enableAI = true,
      sendAutoText = true,
      businessHoursOnly = true,
      startHour = 9,
      endHour = 20,
      timezone = 'America/New_York'
    } = config;
    
    const jobId = `tag-poll-${tenantId}-${tagName}`;
    
    // Remove existing job if any
    await this.removeScheduledJob('tag-poll', jobId);
    
    // Calculate cron pattern if business hours only
    let scheduleOptions;
    
    if (businessHoursOnly) {
      // Create cron pattern for business hours
      // Example: Every 3 minutes between 9am-8pm
      const minute = `*/${intervalMinutes}`;
      const cronPattern = `${minute} ${startHour}-${endHour} * * *`;
      
      scheduleOptions = {
        repeat: {
          cron: cronPattern,
          tz: timezone
        },
        jobId
      };
    } else {
      // Simple interval-based polling
      scheduleOptions = {
        repeat: {
          every: intervalMinutes * 60 * 1000 // Convert to milliseconds
        },
        jobId
      };
    }
    
    // Add repeatable job
    const job = await QueueManager.addJob('tag-poll', {
      tenantId,
      tagName,
      processImmediately,
      enableAI,
      sendAutoText,
      sinceMinutesAgo: intervalMinutes * 2 // Look back twice the interval
    }, scheduleOptions);
    
    console.log(`📅 Scheduled polling for tag "${tagName}" every ${intervalMinutes} minutes (tenant: ${tenantId})`);
    
    // Store configuration in database for persistence
    await this.saveTagPollingConfig(tenantId, {
      tagName,
      intervalMinutes,
      processImmediately,
      enableAI,
      sendAutoText,
      businessHoursOnly,
      startHour,
      endHour,
      timezone,
      jobId,
      isActive: true
    });
    
    return job;
  }
  
  /**
   * Remove scheduled job
   */
  static async removeScheduledJob(queueName, jobId) {
    try {
      const queue = QueueManager.queues[queueName];
      if (!queue) return false;
      
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
   * Save tag polling configuration to database
   */
  static async saveTagPollingConfig(tenantId, config) {
    try {
      const { supabase } = require('../config/supabase');
      
      if (!supabase) {
        console.warn('Supabase not configured - skipping config save');
        return;
      }
      
      // Upsert configuration
      await supabase
        .from('tag_polling_configs')
        .upsert({
          organization_id: tenantId,
          tag_name: config.tagName,
          interval_minutes: config.intervalMinutes,
          process_immediately: config.processImmediately,
          enable_ai: config.enableAI,
          send_auto_text: config.sendAutoText,
          business_hours_only: config.businessHoursOnly,
          start_hour: config.startHour,
          end_hour: config.endHour,
          timezone: config.timezone,
          job_id: config.jobId,
          is_active: config.isActive,
          updated_at: new Date()
        }, {
          onConflict: 'tenant_id,tag_name'
        });
      
    } catch (error) {
      console.error('Error saving tag polling config:', error);
    }
  }
  
  /**
   * Get all tag polling configurations for a tenant
   */
  static async getTagPollingConfigs(tenantId) {
    try {
      const { supabase } = require('../config/supabase');
      
      if (!supabase) return [];
      
      const { data, error } = await supabase
        .from('tag_polling_configs')
        .select('*')
        .eq('organization_id', tenantId)
        .order('tag_name');
      
      if (error) {
        console.error('Error fetching tag polling configs:', error);
        return [];
      }
      
      return data || [];
      
    } catch (error) {
      console.error('Error getting tag polling configs:', error);
      return [];
    }
  }
  
  /**
   * Get all scheduled tag polls for a tenant
   */
  static async getScheduledTagPolls(tenantId) {
    try {
      const queue = QueueManager.queues['tag-poll'];
      if (!queue) return [];
      
      const repeatableJobs = await queue.getRepeatableJobs();
      
      // Filter jobs for this tenant
      const tenantJobs = repeatableJobs.filter(job => {
        return job.id && job.id.includes(tenantId);
      });
      
      return tenantJobs.map(job => {
        // Extract tag name from job ID
        const tagName = job.id.replace(`tag-poll-${tenantId}-`, '');
        
        return {
          id: job.id,
          tagName,
          name: job.name,
          pattern: job.cron || `Every ${job.every / 60000} minutes`,
          next: job.next ? new Date(job.next) : null,
          tz: job.tz || 'UTC'
        };
      });
      
    } catch (error) {
      console.error('Error getting scheduled tag polls:', error);
      return [];
    }
  }
  
  /**
   * Pause all tag polling schedules for a tenant
   */
  static async pauseSchedules(tenantId) {
    try {
      const jobs = await this.getScheduledTagPolls(tenantId);
      
      for (const job of jobs) {
        await this.removeScheduledJob('tag-poll', job.id);
      }
      
      // Update configs in database
      const { supabase } = require('../config/supabase');
      if (supabase) {
        await supabase
          .from('tag_polling_configs')
          .update({ is_active: false })
          .eq('organization_id', tenantId);
      }
      
      console.log(`⏸️ Paused all tag polling schedules for tenant ${tenantId}`);
      return true;
      
    } catch (error) {
      console.error('Error pausing tag polling schedules:', error);
      return false;
    }
  }
  
  /**
   * Resume tag polling schedules for a tenant
   */
  static async resumeSchedules(tenantId) {
    try {
      // Get saved configurations from database
      const configs = await this.getTagPollingConfigs(tenantId);
      
      if (configs.length === 0) {
        // Use default AIM_ASSIST if no configs
        return await this.initializeForTenant(tenantId);
      }
      
      // Restore each configuration
      for (const config of configs) {
        if (config.is_active) {
          await this.scheduleTagPolling(tenantId, {
            tagName: config.tag_name,
            intervalMinutes: config.interval_minutes,
            processImmediately: config.process_immediately,
            enableAI: config.enable_ai,
            sendAutoText: config.send_auto_text,
            businessHoursOnly: config.business_hours_only,
            startHour: config.start_hour,
            endHour: config.end_hour,
            timezone: config.timezone
          });
        }
      }
      
      console.log(`▶️ Resumed tag polling schedules for tenant ${tenantId}`);
      return true;
      
    } catch (error) {
      console.error('Error resuming tag polling schedules:', error);
      return false;
    }
  }
  
  /**
   * Initialize default schedules for all active tenants
   */
  static async initializeAllTenants() {
    try {
      const { supabase } = require('../config/supabase');
      
      if (!supabase) {
        console.warn('Supabase not configured - skipping tenant initialization');
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
        const tagPollingConfig = tenant.settings?.tag_polling || [];
        await this.initializeForTenant(tenant.id, tagPollingConfig);
      }
      
      console.log(`✅ Initialized tag polling schedules for ${tenants.length} tenants`);
      
    } catch (error) {
      console.error('Error initializing all tenant tag polling:', error);
    }
  }
}

module.exports = TagPollingScheduler;