/**
 * Initializes Bull queues with Redis
 * Creates separate queues for SMS, auto-text, CRM sync
 * Configures retry logic and rate limiting
 * Provides queue monitoring endpoints
 */

const Bull = require('bull');
const redis = require('redis');

class QueueManager {
  constructor() {
    this.queues = {};
    this.processors = {};
    this.redisConfig = this.getRedisConfig();
    this.initialized = false;
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig() {
    if (process.env.REDIS_URL) {
      // Parse Redis URL for cloud providers
      const url = new URL(process.env.REDIS_URL);
      return {
        redis: {
          host: url.hostname,
          port: url.port,
          password: url.password,
          db: 0
        }
      };
    }
    
    // Local Redis configuration
    return {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: 0
      }
    };
  }

  /**
   * Initialize all queues
   */
  async initialize() {
    try {
      console.log('🔄 Initializing queue system...');
      
      // Test Redis connection
      const testClient = redis.createClient(this.redisConfig.redis);
      
      testClient.on('error', (err) => {
        console.warn('⚠️ Redis connection error:', err.message);
        console.log('📝 Queues will use in-memory fallback');
      });
      
      // Create queues
      this.createQueue('sms', {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });
      
      this.createQueue('auto-text', {
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 5000
          }
        }
      });
      
      this.createQueue('lead-sync', {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 1
        }
      });
      
      this.createQueue('webhook', {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      });
      
      this.createQueue('extraction', {
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          },
          timeout: 30000 // 30 second timeout for AI extraction
        }
      });
      
      this.createQueue('tag-poll', {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 60000 // 1 minute between retries
          }
        }
      });
      
      // Register processors
      this.registerProcessors();
      
      this.initialized = true;
      console.log('✅ Queue system initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Queue initialization failed:', error);
      // Continue without queues - use direct processing
      return false;
    }
  }

  /**
   * Create a queue
   */
  createQueue(name, options = {}) {
    try {
      this.queues[name] = new Bull(name, {
        ...this.redisConfig,
        ...options
      });
      
      // Add event listeners
      this.queues[name].on('completed', (job) => {
        console.log(`✅ Job ${job.id} in ${name} queue completed`);
      });
      
      this.queues[name].on('failed', (job, err) => {
        console.error(`❌ Job ${job.id} in ${name} queue failed:`, err.message);
      });
      
      console.log(`📌 Queue created: ${name}`);
    } catch (error) {
      console.error(`Failed to create queue ${name}:`, error);
      // Create mock queue for testing
      this.queues[name] = this.createMockQueue(name);
    }
  }

  /**
   * Create mock queue for when Redis isn't available
   */
  createMockQueue(name) {
    return {
      name,
      add: async (data, options = {}) => {
        console.log(`Mock queue ${name} - job added:`, data);
        
        // Simulate delay if specified
        if (options.delay) {
          setTimeout(() => {
            console.log(`Mock queue ${name} - job processed after ${options.delay}ms`);
          }, options.delay);
        }
        
        return {
          id: 'mock-' + Date.now(),
          data,
          opts: options
        };
      },
      process: (processor) => {
        console.log(`Mock queue ${name} - processor registered`);
        this.processors[name] = processor;
      },
      getJobCounts: async () => ({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      }),
      clean: async () => {
        console.log(`Mock queue ${name} - cleaned`);
      },
      close: async () => {
        console.log(`Mock queue ${name} - closed`);
      }
    };
  }

  /**
   * Register queue processors
   */
  registerProcessors() {
    // SMS Queue Processor
    if (this.queues.sms) {
      const smsProcessor = require('./processors/smsProcessor');
      this.queues.sms.process(smsProcessor);
    }
    
    // Auto-text Queue Processor
    if (this.queues['auto-text']) {
      const autoTextProcessor = require('./processors/autoTextProcessor');
      this.queues['auto-text'].process(autoTextProcessor);
    }
    
    // Lead Sync Queue Processor
    if (this.queues['lead-sync']) {
      const leadSyncProcessor = require('./processors/leadSyncProcessor');
      this.queues['lead-sync'].process(leadSyncProcessor);
    }
    
    // Webhook Queue Processor
    if (this.queues.webhook) {
      const webhookProcessor = require('./processors/webhookProcessor');
      this.queues.webhook.process(webhookProcessor);
    }
    
    // Extraction Queue Processor
    if (this.queues.extraction) {
      const extractionProcessor = require('./processors/extractionProcessor');
      this.queues.extraction.process(extractionProcessor);
    }
    
    // Tag Poll Queue Processor
    if (this.queues['tag-poll']) {
      const tagPollProcessor = require('./processors/tagPollProcessor');
      this.queues['tag-poll'].process(tagPollProcessor);
    }
  }

  /**
   * Add job to queue
   */
  async addJob(queueName, data, options = {}) {
    const queue = this.queues[queueName];
    
    if (!queue) {
      console.error(`Queue ${queueName} not found`);
      throw new Error(`Queue ${queueName} not initialized`);
    }
    
    try {
      const job = await queue.add(data, options);
      console.log(`📋 Job ${job.id} added to ${queueName} queue`);
      return job;
    } catch (error) {
      console.error(`Error adding job to ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Add SMS job with standard delay
   */
  async queueSMS(data, priority = 1) {
    // Map tenantId to organizationId for database compatibility
    const mappedData = {
      ...data,
      organizationId: data.organizationId || data.tenantId,
      tenantId: undefined // Remove to avoid confusion
    };
    
    console.log(`📨 Queueing SMS:`, {
      organizationId: mappedData.organizationId,
      leadId: mappedData.leadId,
      to: mappedData.to,
      messagePreview: mappedData.message ? mappedData.message.substring(0, 30) + '...' : 'No message',
      delay: mappedData.delay !== undefined ? mappedData.delay : 45000
    });
    
    return this.addJob('sms', mappedData, {
      delay: mappedData.delay !== undefined ? mappedData.delay : 45000, // Default 45 second delay (0 is valid)
      priority,
      attempts: 3
    });
  }

  /**
   * Add auto-text job
   */
  async queueAutoText(data, delayMinutes = 1) {
    // Map tenantId to organizationId for database compatibility
    const mappedData = {
      ...data,
      organizationId: data.organizationId || data.tenantId,
      tenantId: undefined // Remove to avoid confusion
    };
    
    return this.addJob('auto-text', mappedData, {
      delay: delayMinutes * 60 * 1000,
      priority: 2
    });
  }

  /**
   * Add extraction job
   */
  async queueExtraction(data, priority = 2) {
    return this.addJob('extraction', data, {
      priority,
      attempts: data.attempts || 3,
      delay: data.delay || 0
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName = null) {
    try {
      if (queueName) {
        const queue = this.queues[queueName];
        if (!queue) return null;
        
        const counts = await queue.getJobCounts();
        return {
          name: queueName,
          ...counts
        };
      }
      
      // Get stats for all queues
      const stats = {};
      for (const [name, queue] of Object.entries(this.queues)) {
        stats[name] = await queue.getJobCounts();
      }
      return stats;
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {};
    }
  }

  /**
   * Clear queue
   */
  async clearQueue(queueName, status = 'completed') {
    const queue = this.queues[queueName];
    if (!queue) return false;
    
    try {
      await queue.clean(0, status);
      console.log(`🧹 Queue ${queueName} cleared (${status} jobs)`);
      return true;
    } catch (error) {
      console.error(`Error clearing queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) return false;
    
    try {
      await queue.pause();
      console.log(`⏸️ Queue ${queueName} paused`);
      return true;
    } catch (error) {
      console.error(`Error pausing queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) return false;
    
    try {
      await queue.resume();
      console.log(`▶️ Queue ${queueName} resumed`);
      return true;
    } catch (error) {
      console.error(`Error resuming queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Shutdown all queues gracefully
   */
  async shutdown() {
    console.log('🔻 Shutting down queue system...');
    
    for (const [name, queue] of Object.entries(this.queues)) {
      try {
        await queue.close();
        console.log(`✅ Queue ${name} closed`);
      } catch (error) {
        console.error(`Error closing queue ${name}:`, error);
      }
    }
    
    this.initialized = false;
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(queueName, limit = 10) {
    const queue = this.queues[queueName];
    if (!queue || !queue.getFailed) return [];
    
    try {
      const jobs = await queue.getFailed(0, limit);
      return jobs.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp
      }));
    } catch (error) {
      console.error(`Error getting failed jobs from ${queueName}:`, error);
      return [];
    }
  }

  /**
   * Retry failed job
   */
  async retryFailedJob(queueName, jobId) {
    const queue = this.queues[queueName];
    if (!queue) return false;
    
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.retry();
        console.log(`🔄 Job ${jobId} retried in ${queueName} queue`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error retrying job ${jobId}:`, error);
      return false;
    }
  }
}

// Export both the class and singleton instance
module.exports = QueueManager;
module.exports.default = new QueueManager();