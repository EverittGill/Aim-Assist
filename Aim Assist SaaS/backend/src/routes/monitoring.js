/**
 * Monitoring Dashboard Routes
 * Provides extraction system metrics and insights
 */

const express = require('express');
const router = express.Router();
const QueueManager = require('../queues/QueueManager');
const AuditService = require('../services/AuditService');
const { supabase } = require('../config/supabase');

/**
 * Get extraction system dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || 'demo-tenant';
    
    // Get time range from query params
    const { period = '24h' } = req.query;
    const startDate = getStartDate(period);
    const endDate = new Date();
    
    // Initialize services
    const auditService = new AuditService(organizationId);
    
    // Fetch all metrics in parallel
    const [
      queueStats,
      extractionStats,
      performanceMetrics,
      errorAnalysis,
      topLeads,
      recentActivity
    ] = await Promise.all([
      getQueueStatistics(),
      getExtractionStatistics(auditService, startDate, endDate),
      getPerformanceMetrics(auditService, startDate, endDate),
      getErrorAnalysis(auditService, startDate, endDate),
      getTopLeads(auditService, startDate, endDate),
      getRecentActivity(auditService)
    ]);
    
    const dashboard = {
      timestamp: new Date().toISOString(),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        label: period
      },
      queues: queueStats,
      extraction: extractionStats,
      performance: performanceMetrics,
      errors: errorAnalysis,
      topLeads: topLeads,
      recentActivity: recentActivity,
      health: calculateHealthScore({
        queueStats,
        extractionStats,
        performanceMetrics,
        errorAnalysis
      })
    };
    
    res.json(dashboard);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      details: error.message
    });
  }
});

/**
 * Get extraction statistics for a specific lead
 */
router.get('/lead/:leadId', async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || 'demo-tenant';
    const { leadId } = req.params;
    
    const auditService = new AuditService(organizationId);
    
    // Get extraction history
    const extractionHistory = await auditService.getExtractionHistory(leadId);
    const updateHistory = await auditService.getCRMUpdateHistory(leadId);
    const timeline = await auditService.getChangeTimeline(leadId);
    
    // Calculate statistics
    const stats = {
      leadId,
      totalExtractions: extractionHistory.length,
      totalUpdates: updateHistory.length,
      timeline,
      latestExtraction: extractionHistory[0] || null,
      averageConfidence: calculateAverageConfidence(extractionHistory),
      fieldsExtracted: getExtractedFields(extractionHistory),
      extractionMethods: getExtractionMethods(extractionHistory),
      successRate: calculateSuccessRate(extractionHistory)
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Lead stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch lead statistics',
      details: error.message
    });
  }
});

/**
 * Get compliance report
 */
router.get('/compliance', async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || 'demo-tenant';
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate query parameters are required'
      });
    }
    
    const auditService = new AuditService(organizationId);
    const report = await auditService.generateComplianceReport(
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json(report);
    
  } catch (error) {
    console.error('Compliance report error:', error);
    res.status(500).json({
      error: 'Failed to generate compliance report',
      details: error.message
    });
  }
});

/**
 * Export audit logs
 */
router.get('/export', async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || 'demo-tenant';
    const { format = 'json', ...filters } = req.query;
    
    const auditService = new AuditService(organizationId);
    const data = await auditService.exportLogs(filters, format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.send(data);
    } else {
      res.json(data);
    }
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export audit logs',
      details: error.message
    });
  }
});

/**
 * Get real-time extraction metrics
 */
router.get('/realtime', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      queues: await QueueManager.getQueueStats(),
      activeJobs: await getActiveJobs(),
      recentExtractions: await getRecentExtractions(),
      systemHealth: await checkSystemHealth()
    };
    
    res.json(metrics);
    
  } catch (error) {
    console.error('Realtime metrics error:', error);
    res.status(500).json({
      error: 'Failed to fetch realtime metrics',
      details: error.message
    });
  }
});

/**
 * Helper Functions
 */

function getStartDate(period) {
  const now = new Date();
  switch (period) {
    case '1h':
      return new Date(now - 60 * 60 * 1000);
    case '6h':
      return new Date(now - 6 * 60 * 60 * 1000);
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
}

async function getQueueStatistics() {
  try {
    const stats = await QueueManager.getQueueStats();
    
    // Calculate totals
    const totals = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    };
    
    Object.values(stats).forEach(queueStats => {
      totals.waiting += queueStats.waiting || 0;
      totals.active += queueStats.active || 0;
      totals.completed += queueStats.completed || 0;
      totals.failed += queueStats.failed || 0;
      totals.delayed += queueStats.delayed || 0;
    });
    
    return {
      byQueue: stats,
      totals,
      healthStatus: totals.failed > 10 ? 'warning' : 'healthy'
    };
  } catch (error) {
    console.error('Queue stats error:', error);
    return { byQueue: {}, totals: {}, healthStatus: 'unknown' };
  }
}

async function getExtractionStatistics(auditService, startDate, endDate) {
  const logs = await auditService.queryLogs({
    eventType: 'extraction',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });
  
  const stats = {
    total: logs.length,
    successful: logs.filter(l => l.status === 'success').length,
    failed: logs.filter(l => l.status === 'failed').length,
    averageConfidence: 0,
    byMethod: {},
    byTrigger: {},
    autoUpdates: 0,
    manualReviews: 0
  };
  
  let totalConfidence = 0;
  let confidenceCount = 0;
  
  logs.forEach(log => {
    // Calculate average confidence
    if (log.details?.confidence) {
      totalConfidence += log.details.confidence;
      confidenceCount++;
    }
    
    // Count by method
    const method = log.details?.method || 'unknown';
    stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
    
    // Count by trigger
    const trigger = log.details?.trigger || 'unknown';
    stats.byTrigger[trigger] = (stats.byTrigger[trigger] || 0) + 1;
    
    // Count auto updates
    if (log.details?.auto_updated) {
      stats.autoUpdates++;
    }
  });
  
  if (confidenceCount > 0) {
    stats.averageConfidence = (totalConfidence / confidenceCount).toFixed(3);
  }
  
  stats.successRate = stats.total > 0 
    ? ((stats.successful / stats.total) * 100).toFixed(2) + '%'
    : '0%';
  
  return stats;
}

async function getPerformanceMetrics(auditService, startDate, endDate) {
  const logs = await auditService.queryLogs({
    eventType: 'extraction',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });
  
  const processingTimes = logs
    .map(l => l.details?.processing_time_ms)
    .filter(t => t !== undefined && t !== null);
  
  if (processingTimes.length === 0) {
    return {
      averageProcessingTime: 0,
      minProcessingTime: 0,
      maxProcessingTime: 0,
      p50ProcessingTime: 0,
      p95ProcessingTime: 0
    };
  }
  
  processingTimes.sort((a, b) => a - b);
  
  return {
    averageProcessingTime: Math.round(
      processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    ),
    minProcessingTime: processingTimes[0],
    maxProcessingTime: processingTimes[processingTimes.length - 1],
    p50ProcessingTime: processingTimes[Math.floor(processingTimes.length * 0.5)],
    p95ProcessingTime: processingTimes[Math.floor(processingTimes.length * 0.95)]
  };
}

async function getErrorAnalysis(auditService, startDate, endDate) {
  const logs = await auditService.queryLogs({
    status: 'failed',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });
  
  const errorTypes = {};
  const errorsByHour = {};
  
  logs.forEach(log => {
    // Categorize errors
    const errorType = categorizeError(log.error);
    errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    
    // Group by hour
    const hour = new Date(log.timestamp).getHours();
    errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
  });
  
  return {
    totalErrors: logs.length,
    byType: errorTypes,
    byHour: errorsByHour,
    recentErrors: logs.slice(0, 5).map(l => ({
      timestamp: l.timestamp,
      entity: l.entity_id,
      error: l.error
    }))
  };
}

function categorizeError(error) {
  if (!error) return 'unknown';
  
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('timeout')) return 'timeout';
  if (errorLower.includes('rate limit')) return 'rate_limit';
  if (errorLower.includes('api')) return 'api_error';
  if (errorLower.includes('validation')) return 'validation';
  if (errorLower.includes('connection')) return 'connection';
  if (errorLower.includes('permission')) return 'permission';
  
  return 'other';
}

async function getTopLeads(auditService, startDate, endDate) {
  const logs = await auditService.queryLogs({
    eventType: 'extraction',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });
  
  const leadCounts = {};
  const leadConfidence = {};
  
  logs.forEach(log => {
    const leadId = log.entity_id;
    leadCounts[leadId] = (leadCounts[leadId] || 0) + 1;
    
    if (log.details?.confidence) {
      if (!leadConfidence[leadId]) {
        leadConfidence[leadId] = [];
      }
      leadConfidence[leadId].push(log.details.confidence);
    }
  });
  
  // Sort by extraction count
  const topLeads = Object.entries(leadCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([leadId, count]) => {
      const confidences = leadConfidence[leadId] || [];
      const avgConfidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
      
      return {
        leadId,
        extractionCount: count,
        averageConfidence: avgConfidence.toFixed(3)
      };
    });
  
  return topLeads;
}

async function getRecentActivity(auditService) {
  const logs = await auditService.queryLogs({ limit: 20 });
  
  return logs.map(log => ({
    timestamp: log.timestamp,
    type: log.event_type,
    entity: log.entity_id,
    action: log.action,
    status: log.status
  }));
}

async function getActiveJobs() {
  try {
    const extraction = QueueManager.queues.extraction;
    if (!extraction || !extraction.getJobs) return [];
    
    const activeJobs = await extraction.getJobs(['active']);
    
    return activeJobs.map(job => ({
      id: job.id,
      leadId: job.data.leadId,
      trigger: job.data.trigger,
      startTime: job.processedOn,
      progress: job.progress()
    }));
  } catch (error) {
    console.error('Active jobs error:', error);
    return [];
  }
}

async function getRecentExtractions() {
  try {
    if (!supabase) return [];
    
    const { data } = await supabase
      .from('extraction_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    return data || [];
  } catch (error) {
    console.error('Recent extractions error:', error);
    return [];
  }
}

async function checkSystemHealth() {
  const health = {
    redis: 'unknown',
    supabase: 'unknown',
    claude: 'unknown',
    queues: 'unknown'
  };
  
  // Check Redis
  try {
    const stats = await QueueManager.getQueueStats();
    health.redis = Object.keys(stats).length > 0 ? 'healthy' : 'degraded';
    health.queues = 'healthy';
  } catch {
    health.redis = 'unhealthy';
    health.queues = 'unhealthy';
  }
  
  // Check Supabase
  try {
    if (supabase) {
      const { error } = await supabase.from('audit_logs').select('id').limit(1);
      health.supabase = error ? 'degraded' : 'healthy';
    } else {
      health.supabase = 'not_configured';
    }
  } catch {
    health.supabase = 'unhealthy';
  }
  
  // Check Claude API
  health.claude = process.env.CLAUDE_API_KEY ? 'configured' : 'not_configured';
  
  return health;
}

function calculateHealthScore(metrics) {
  let score = 100;
  
  // Deduct points for queue failures
  if (metrics.queueStats.totals.failed > 10) score -= 10;
  if (metrics.queueStats.totals.failed > 50) score -= 20;
  
  // Deduct points for extraction failures
  const failureRate = metrics.extractionStats.total > 0
    ? (metrics.extractionStats.failed / metrics.extractionStats.total)
    : 0;
  
  if (failureRate > 0.1) score -= 15;
  if (failureRate > 0.25) score -= 25;
  
  // Deduct points for low confidence
  if (metrics.extractionStats.averageConfidence < 0.7) score -= 10;
  if (metrics.extractionStats.averageConfidence < 0.5) score -= 20;
  
  // Deduct points for slow processing
  if (metrics.performanceMetrics.p95ProcessingTime > 10000) score -= 10;
  if (metrics.performanceMetrics.p95ProcessingTime > 30000) score -= 20;
  
  return {
    score: Math.max(0, score),
    status: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'unhealthy',
    factors: {
      queueFailures: metrics.queueStats.totals.failed,
      extractionFailureRate: (failureRate * 100).toFixed(2) + '%',
      averageConfidence: metrics.extractionStats.averageConfidence,
      p95ProcessingTime: metrics.performanceMetrics.p95ProcessingTime + 'ms'
    }
  };
}

function calculateAverageConfidence(extractionHistory) {
  const confidences = extractionHistory
    .map(e => e.details?.confidence)
    .filter(c => c !== undefined && c !== null);
  
  if (confidences.length === 0) return 0;
  
  return (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3);
}

function getExtractedFields(extractionHistory) {
  const fields = new Set();
  
  extractionHistory.forEach(e => {
    if (e.details?.extraction_data) {
      Object.keys(e.details.extraction_data).forEach(field => {
        if (e.details.extraction_data[field] !== null) {
          fields.add(field);
        }
      });
    }
  });
  
  return Array.from(fields);
}

function getExtractionMethods(extractionHistory) {
  const methods = {};
  
  extractionHistory.forEach(e => {
    const method = e.details?.method || 'unknown';
    methods[method] = (methods[method] || 0) + 1;
  });
  
  return methods;
}

function calculateSuccessRate(extractionHistory) {
  if (extractionHistory.length === 0) return '0%';
  
  const successful = extractionHistory.filter(e => e.status === 'success').length;
  return ((successful / extractionHistory.length) * 100).toFixed(2) + '%';
}

module.exports = router;