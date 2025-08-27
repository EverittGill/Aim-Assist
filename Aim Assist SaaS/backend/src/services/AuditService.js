/**
 * Audit Service
 * Tracks all extraction events, CRM updates, and data changes
 * Provides compliance logging and change history
 */

const { supabase } = require('../config/supabase');

class AuditService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.localStorage = new Map(); // Fallback for when Supabase isn't available
  }

  /**
   * Log extraction event
   */
  async logExtraction(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'extraction',
      entity_type: 'lead',
      entity_id: data.leadId,
      action: data.action || 'extract',
      details: {
        conversation_id: data.conversationId,
        extraction_data: data.extraction,
        confidence: data.confidence,
        method: data.method,
        trigger: data.trigger,
        insights: data.insights,
        auto_updated: data.autoUpdated,
        processing_time_ms: data.processingTime
      },
      metadata: {
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        session_id: data.sessionId
      },
      status: data.status || 'success',
      error: data.error || null,
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Log CRM update
   */
  async logCRMUpdate(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'crm_update',
      entity_type: 'lead',
      entity_id: data.leadId,
      action: data.action || 'update',
      details: {
        changes: data.changes,
        previous_values: data.previousValues,
        new_values: data.newValues,
        fields_updated: Object.keys(data.changes || {}),
        source: data.source || 'extraction'
      },
      metadata: {
        extraction_id: data.extractionId,
        confidence: data.confidence,
        auto_update: data.autoUpdate || false
      },
      status: data.status || 'success',
      error: data.error || null,
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Log AI interaction
   */
  async logAIInteraction(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'ai_interaction',
      entity_type: 'conversation',
      entity_id: data.conversationId,
      action: 'generate_response',
      details: {
        lead_id: data.leadId,
        input_message: data.inputMessage,
        generated_response: data.generatedResponse,
        provider: data.provider || 'claude',
        model: data.model,
        template_used: data.template,
        tokens_used: data.tokensUsed,
        response_time_ms: data.responseTime
      },
      metadata: {
        context_size: data.contextSize,
        confidence_score: data.confidenceScore
      },
      status: data.status || 'success',
      error: data.error || null,
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Log manual review action
   */
  async logManualReview(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'manual_review',
      entity_type: 'extraction',
      entity_id: data.extractionId,
      action: data.action || 'review',
      details: {
        lead_id: data.leadId,
        reviewer_id: data.reviewerId,
        original_extraction: data.originalExtraction,
        corrections: data.corrections,
        approval_status: data.approvalStatus,
        review_notes: data.reviewNotes
      },
      metadata: {
        review_time_seconds: data.reviewTime,
        changes_made: data.changesMade || false
      },
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Log escalation event
   */
  async logEscalation(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'escalation',
      entity_type: 'lead',
      entity_id: data.leadId,
      action: 'escalate',
      details: {
        conversation_id: data.conversationId,
        reason: data.reason,
        context: data.context,
        ai_paused: true,
        assigned_to: data.assignedTo,
        escalation_level: data.level || 1
      },
      metadata: {
        trigger_message: data.triggerMessage,
        extraction_confidence: data.extractionConfidence
      },
      status: 'escalated',
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Log data access event (for compliance)
   */
  async logDataAccess(data) {
    const auditEntry = {
      organization_id: this.tenantId,
      event_type: 'data_access',
      entity_type: data.entityType,
      entity_id: data.entityId,
      action: data.action || 'read',
      details: {
        user_id: data.userId,
        purpose: data.purpose,
        fields_accessed: data.fieldsAccessed,
        records_count: data.recordsCount
      },
      metadata: {
        ip_address: data.ipAddress,
        session_id: data.sessionId,
        api_endpoint: data.apiEndpoint
      },
      status: 'success',
      timestamp: new Date().toISOString()
    };

    return this.writeAuditLog(auditEntry);
  }

  /**
   * Write audit log entry
   */
  async writeAuditLog(entry) {
    try {
      if (!supabase) {
        // Fallback to local storage
        const key = `${entry.event_type}-${Date.now()}`;
        this.localStorage.set(key, entry);
        console.log(`📝 Audit log (local):`, entry.event_type, entry.entity_id);
        return { success: true, id: key };
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .insert([entry])
        .select()
        .single();

      if (error) {
        console.error('Failed to write audit log:', error);
        // Fallback to local storage
        const key = `${entry.event_type}-${Date.now()}`;
        this.localStorage.set(key, entry);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };

    } catch (error) {
      console.error('Audit log error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}) {
    try {
      if (!supabase) {
        // Return from local storage
        const logs = Array.from(this.localStorage.values())
          .filter(log => {
            if (filters.eventType && log.event_type !== filters.eventType) return false;
            if (filters.entityId && log.entity_id !== filters.entityId) return false;
            if (filters.startDate && new Date(log.timestamp) < new Date(filters.startDate)) return false;
            if (filters.endDate && new Date(log.timestamp) > new Date(filters.endDate)) return false;
            return true;
          })
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return logs.slice(0, filters.limit || 100);
      }

      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', this.tenantId);

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters.entityId) {
        query = query.eq('entity_id', filters.entityId);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }

      query = query.order('timestamp', { ascending: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to query audit logs:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('Audit query error:', error);
      return [];
    }
  }

  /**
   * Get extraction history for a lead
   */
  async getExtractionHistory(leadId, limit = 50) {
    return this.queryLogs({
      eventType: 'extraction',
      entityId: leadId,
      limit
    });
  }

  /**
   * Get CRM update history for a lead
   */
  async getCRMUpdateHistory(leadId, limit = 50) {
    return this.queryLogs({
      eventType: 'crm_update',
      entityId: leadId,
      limit
    });
  }

  /**
   * Get change timeline for a lead
   */
  async getChangeTimeline(leadId) {
    const logs = await this.queryLogs({
      entityId: leadId,
      limit: 100
    });

    // Group by date and event type
    const timeline = {};
    
    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString();
      if (!timeline[date]) {
        timeline[date] = {
          extractions: 0,
          updates: 0,
          escalations: 0,
          reviews: 0,
          events: []
        };
      }

      switch (log.event_type) {
        case 'extraction':
          timeline[date].extractions++;
          break;
        case 'crm_update':
          timeline[date].updates++;
          break;
        case 'escalation':
          timeline[date].escalations++;
          break;
        case 'manual_review':
          timeline[date].reviews++;
          break;
      }

      timeline[date].events.push({
        time: new Date(log.timestamp).toLocaleTimeString(),
        type: log.event_type,
        action: log.action,
        status: log.status
      });
    });

    return timeline;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate, endDate) {
    const logs = await this.queryLogs({
      startDate,
      endDate
    });

    const report = {
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        total_events: logs.length,
        extractions: 0,
        crm_updates: 0,
        ai_interactions: 0,
        escalations: 0,
        manual_reviews: 0,
        data_accesses: 0
      },
      by_status: {
        success: 0,
        failed: 0,
        escalated: 0
      },
      by_entity: {},
      errors: [],
      high_confidence_extractions: 0,
      low_confidence_extractions: 0,
      auto_updates: 0,
      manual_interventions: 0
    };

    logs.forEach(log => {
      // Count by event type
      switch (log.event_type) {
        case 'extraction':
          report.summary.extractions++;
          if (log.details?.confidence >= 0.85) {
            report.high_confidence_extractions++;
          } else if (log.details?.confidence < 0.5) {
            report.low_confidence_extractions++;
          }
          if (log.details?.auto_updated) {
            report.auto_updates++;
          }
          break;
        case 'crm_update':
          report.summary.crm_updates++;
          break;
        case 'ai_interaction':
          report.summary.ai_interactions++;
          break;
        case 'escalation':
          report.summary.escalations++;
          report.manual_interventions++;
          break;
        case 'manual_review':
          report.summary.manual_reviews++;
          report.manual_interventions++;
          break;
        case 'data_access':
          report.summary.data_accesses++;
          break;
      }

      // Count by status
      if (log.status === 'success') report.by_status.success++;
      else if (log.status === 'failed') report.by_status.failed++;
      else if (log.status === 'escalated') report.by_status.escalated++;

      // Count by entity
      if (!report.by_entity[log.entity_type]) {
        report.by_entity[log.entity_type] = 0;
      }
      report.by_entity[log.entity_type]++;

      // Collect errors
      if (log.error) {
        report.errors.push({
          timestamp: log.timestamp,
          event_type: log.event_type,
          entity_id: log.entity_id,
          error: log.error
        });
      }
    });

    // Calculate percentages
    if (report.summary.extractions > 0) {
      report.extraction_success_rate = 
        ((report.summary.extractions - report.errors.filter(e => e.event_type === 'extraction').length) 
        / report.summary.extractions * 100).toFixed(2) + '%';
      
      report.auto_update_rate = 
        (report.auto_updates / report.summary.extractions * 100).toFixed(2) + '%';
    }

    return report;
  }

  /**
   * Export audit logs
   */
  async exportLogs(filters = {}, format = 'json') {
    const logs = await this.queryLogs(filters);
    
    if (format === 'csv') {
      return this.convertToCSV(logs);
    }
    
    return logs;
  }

  /**
   * Convert logs to CSV format
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = [
      'Timestamp',
      'Event Type',
      'Entity Type',
      'Entity ID',
      'Action',
      'Status',
      'Error',
      'Details'
    ];
    
    const rows = logs.map(log => [
      log.timestamp,
      log.event_type,
      log.entity_type,
      log.entity_id,
      log.action,
      log.status,
      log.error || '',
      JSON.stringify(log.details || {})
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csv;
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    try {
      if (!supabase) {
        // Clean local storage
        let deletedCount = 0;
        for (const [key, log] of this.localStorage.entries()) {
          if (new Date(log.timestamp) < cutoffDate) {
            this.localStorage.delete(key);
            deletedCount++;
          }
        }
        console.log(`🧹 Cleaned ${deletedCount} old audit logs from local storage`);
        return deletedCount;
      }
      
      const { data, error } = await supabase
        .from('audit_logs')
        .delete()
        .eq('organization_id', this.tenantId)
        .lt('timestamp', cutoffDate.toISOString())
        .select();
      
      if (error) {
        console.error('Failed to cleanup old logs:', error);
        return 0;
      }
      
      console.log(`🧹 Cleaned ${data?.length || 0} old audit logs`);
      return data?.length || 0;
      
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }
}

module.exports = AuditService;