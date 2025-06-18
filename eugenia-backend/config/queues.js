const Bull = require('bull');
const Redis = require('redis');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

// Create queues
const queues = {};

function initializeQueues() {
  try {
    // SMS Queue for outbound messages
    queues.smsQueue = new Bull('sms-queue', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });

    // Lead Processing Queue for bulk operations
    queues.leadQueue = new Bull('lead-queue', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 10000, // 10 seconds
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });

    console.log('Bull queues initialized successfully');
    
    // Queue event listeners for monitoring
    queues.smsQueue.on('failed', (job, err) => {
      console.error(`SMS job ${job.id} failed:`, err.message);
    });
    
    queues.smsQueue.on('completed', (job) => {
      console.log(`SMS job ${job.id} completed successfully`);
    });

    return queues;
  } catch (error) {
    console.error('Failed to initialize queues:', error);
    console.warn('Running without queue support - messages will be sent directly');
    return null;
  }
}

// Queue monitoring endpoints
function getQueueStats(queue) {
  return Promise.all([
    queue.getJobCounts(),
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]).then(([counts, waiting, active, completed, failed, delayed]) => ({
    counts,
    waiting,
    active,
    completed,
    failed,
    delayed,
  }));
}

module.exports = { initializeQueues, queues, getQueueStats };