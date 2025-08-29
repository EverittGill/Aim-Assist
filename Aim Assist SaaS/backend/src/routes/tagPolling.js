/**
 * Tag Polling Routes
 * Endpoints for polling CRM for specific tagged leads
 */

const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const TagPollingService = require('../services/TagPollingService');
const QueueManager = require('../queues/QueueManager').default;

/**
 * @route POST /api/tag-poll/:tagName
 * @desc Poll CRM for leads with specific tag
 * @param tagName - The tag to search for (e.g., AIM_ASSIST)
 */
router.post('/:tagName', authenticateRequest, async (req, res) => {
  try {
    const { tagName } = req.params;
    const organizationId = req.organizationId || req.organizationId;
    
    const {
      processImmediately = true,
      enableAI = true,
      sendAutoText = true,
      sinceMinutesAgo = 60,
      async = false // If true, queue the job instead of running immediately
    } = req.body;
    
    console.log(`📍 Tag poll request for "${tagName}" from tenant ${organizationId}`);
    
    if (async) {
      // Queue the job for background processing
      const job = await QueueManager.addJob('tag-poll', {
        organizationId,
        tagName,
        processImmediately,
        enableAI,
        sendAutoText,
        sinceMinutesAgo
      });
      
      return res.json({
        success: true,
        message: `Tag poll job queued for ${tagName}`,
        jobId: job.id,
        status: 'queued'
      });
    } else {
      // Process immediately
      const pollService = new TagPollingService(organizationId);
      const result = await pollService.pollForTag(tagName, {
        processImmediately,
        enableAI,
        sendAutoText,
        sinceMinutesAgo
      });
      
      return res.json({
        success: true,
        message: `Tag poll completed for ${tagName}`,
        stats: result.stats,
        leads: result.leads
      });
    }
  } catch (error) {
    console.error('Tag poll error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/tag-poll/stats/:tagName
 * @desc Get polling statistics for a specific tag
 */
router.get('/stats/:tagName', authenticateRequest, async (req, res) => {
  try {
    const { tagName } = req.params;
    const organizationId = req.organizationId || req.organizationId;
    
    const stats = await TagPollingService.getTagPollStats(organizationId, tagName);
    
    if (!stats) {
      return res.json({
        success: true,
        message: `No polling history for tag ${tagName}`,
        stats: null
      });
    }
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching tag poll stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/tag-poll/monitored
 * @desc Get all monitored tags for the tenant
 */
router.get('/monitored', authenticateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId;
    
    const tags = await TagPollingService.getMonitoredTags(organizationId);
    
    res.json({
      success: true,
      count: tags.length,
      tags
    });
  } catch (error) {
    console.error('Error fetching monitored tags:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/tag-poll/schedule/:tagName
 * @desc Schedule recurring polling for a specific tag
 */
router.post('/schedule/:tagName', authenticateRequest, async (req, res) => {
  try {
    const { tagName } = req.params;
    const organizationId = req.organizationId || req.organizationId;
    
    const {
      intervalMinutes = 3, // Poll every 3 minutes by default
      processImmediately = true,
      enableAI = true,
      sendAutoText = true
    } = req.body;
    
    // Create unique job ID for this tenant and tag
    const jobId = `tag-poll-${organizationId}-${tagName}`;
    
    // Remove existing schedule if any
    const queue = QueueManager.queues['tag-poll'];
    if (queue) {
      const repeatableJobs = await queue.getRepeatableJobs();
      const existingJob = repeatableJobs.find(job => job.id === jobId);
      if (existingJob) {
        await queue.removeRepeatableByKey(existingJob.key);
        console.log(`🗑️ Removed existing schedule for ${tagName}`);
      }
    }
    
    // Add new repeatable job
    const job = await QueueManager.addJob('tag-poll', {
      organizationId,
      tagName,
      processImmediately,
      enableAI,
      sendAutoText,
      sinceMinutesAgo: intervalMinutes * 2 // Look back twice the interval
    }, {
      repeat: {
        every: intervalMinutes * 60 * 1000 // Convert to milliseconds
      },
      jobId
    });
    
    console.log(`📅 Scheduled tag polling for ${tagName} every ${intervalMinutes} minutes`);
    
    res.json({
      success: true,
      message: `Scheduled polling for ${tagName} every ${intervalMinutes} minutes`,
      jobId,
      nextRun: new Date(Date.now() + intervalMinutes * 60 * 1000)
    });
  } catch (error) {
    console.error('Error scheduling tag poll:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/tag-poll/schedule/:tagName
 * @desc Remove scheduled polling for a specific tag
 */
router.delete('/schedule/:tagName', authenticateRequest, async (req, res) => {
  try {
    const { tagName } = req.params;
    const organizationId = req.organizationId || req.organizationId;
    
    const jobId = `tag-poll-${organizationId}-${tagName}`;
    
    const queue = QueueManager.queues['tag-poll'];
    if (!queue) {
      return res.status(400).json({
        success: false,
        error: 'Tag poll queue not initialized'
      });
    }
    
    const repeatableJobs = await queue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find(job => job.id === jobId);
    
    if (jobToRemove) {
      await queue.removeRepeatableByKey(jobToRemove.key);
      console.log(`🗑️ Removed scheduled polling for ${tagName}`);
      
      res.json({
        success: true,
        message: `Removed scheduled polling for ${tagName}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `No scheduled polling found for ${tagName}`
      });
    }
  } catch (error) {
    console.error('Error removing scheduled tag poll:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/tag-poll/schedules
 * @desc Get all scheduled tag polls for the tenant
 */
router.get('/schedules', authenticateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId;
    
    const queue = QueueManager.queues['tag-poll'];
    if (!queue) {
      return res.json({
        success: true,
        schedules: []
      });
    }
    
    const repeatableJobs = await queue.getRepeatableJobs();
    
    // Filter jobs for this tenant
    const tenantJobs = repeatableJobs.filter(job => {
      return job.id && job.id.includes(organizationId);
    });
    
    const schedules = tenantJobs.map(job => {
      // Extract tag name from job ID
      const tagName = job.id.replace(`tag-poll-${organizationId}-`, '');
      
      return {
        tagName,
        jobId: job.id,
        intervalMinutes: job.every ? Math.round(job.every / 60000) : null,
        nextRun: job.next ? new Date(job.next) : null
      };
    });
    
    res.json({
      success: true,
      count: schedules.length,
      schedules
    });
  } catch (error) {
    console.error('Error fetching scheduled tag polls:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;