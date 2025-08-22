/**
 * Extraction Queue Processor
 * Handles intelligent data extraction from conversations
 * Updates CRM with extracted data and logs results
 */

const ExtractionService = require('../../services/ExtractionService');
const ContextEnrichmentService = require('../../services/ContextEnrichmentService');
const ConversationService = require('../../services/ConversationService');
const CRMFactory = require('../../services/crm/CRMFactory');
const { supabase } = require('../../config/supabase');

/**
 * Process extraction job
 */
async function processExtractionJob(job) {
  const startTime = Date.now();
  
  try {
    const { 
      tenantId, 
      leadId, 
      conversationId,
      currentMessage,
      trigger = 'message',
      options = {}
    } = job.data;
    
    console.log(`🔍 Processing extraction job for lead ${leadId}, tenant ${tenantId}`);
    
    // Initialize services
    const extractionService = new ExtractionService(tenantId, {
      claudeApiKey: process.env.CLAUDE_API_KEY,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      autoUpdateThreshold: options.autoUpdateThreshold || 0.85
    });
    
    const contextService = new ContextEnrichmentService(tenantId);
    const conversationService = new ConversationService(tenantId);
    
    // Get conversation history
    const messages = await conversationService.getHistory(leadId, 100);
    
    // Format messages for extraction
    const formattedMessages = messages.map(msg => ({
      sender: msg.sender_type === 'lead' ? 'lead' : 
              msg.sender_type === 'ai' ? 'ai' : 'agent',
      content: msg.content,
      timestamp: new Date(msg.created_at)
    }));
    
    // Get enriched context for better extraction
    const enrichedContext = await contextService.getEnrichedContext(leadId);
    
    // Build extraction context
    const extractionContext = {
      leadId,
      tenantId,
      conversation: formattedMessages,
      currentMessage: currentMessage || formattedMessages[formattedMessages.length - 1]?.content,
      leadProfile: {
        name: enrichedContext.profile.fullName,
        source: enrichedContext.profile.source,
        stage: enrichedContext.profile.stage,
        tags: enrichedContext.profile.tags || []
      }
    };
    
    // Perform extraction
    const result = await extractionService.extractFromConversation(extractionContext);
    
    if (!result.success) {
      throw new Error(`Extraction failed: ${result.errors?.join(', ')}`);
    }
    
    console.log(`✅ Extraction completed with ${Math.round(result.extraction.overallConfidence * 100)}% confidence`);
    
    // Get insights
    const insights = extractionService.getInsights(result.extraction);
    
    // Log extraction to database
    await logExtraction({
      tenantId,
      leadId,
      conversationId,
      extraction: result.extraction,
      insights,
      trigger,
      processingTime: Date.now() - startTime
    });
    
    // Update CRM if confidence is high enough
    if (result.shouldAutoUpdate) {
      const adapter = await CRMFactory.getAdapter(tenantId);
      const updateSuccess = await extractionService.updateCRM(
        leadId,
        result.extraction,
        adapter
      );
      
      if (updateSuccess) {
        console.log(`✅ CRM auto-updated for lead ${leadId}`);
      } else {
        console.log(`⚠️ CRM update failed for lead ${leadId}`);
      }
    } else {
      console.log(`📝 Extraction confidence too low for auto-update (${Math.round(result.extraction.overallConfidence * 100)}%)`);
      
      // Queue for manual review if needed
      if (result.extraction.overallConfidence < 0.5) {
        await queueManualReview({
          tenantId,
          leadId,
          extraction: result.extraction,
          reason: 'low_confidence'
        });
      }
    }
    
    // Check for escalation
    if (result.extraction.escalation?.shouldPause) {
      await handleEscalation({
        tenantId,
        leadId,
        conversationId,
        reason: result.extraction.escalation.reason,
        context: result.extraction.escalation.context
      });
    }
    
    // Update job progress
    await job.progress(100);
    
    return {
      success: true,
      leadId,
      extraction: result.extraction,
      insights,
      autoUpdated: result.shouldAutoUpdate,
      processingTime: Date.now() - startTime
    };
    
  } catch (error) {
    console.error(`❌ Extraction job failed for lead ${job.data.leadId}:`, error);
    
    // Log failed extraction
    await logExtraction({
      tenantId: job.data.tenantId,
      leadId: job.data.leadId,
      conversationId: job.data.conversationId,
      error: error.message,
      trigger: job.data.trigger,
      processingTime: Date.now() - startTime,
      status: 'failed'
    });
    
    throw error;
  }
}

/**
 * Log extraction to database
 */
async function logExtraction(data) {
  try {
    if (!supabase) {
      console.log('📝 Mock extraction log:', {
        lead_id: data.leadId,
        status: data.status || 'completed',
        confidence: data.extraction?.overallConfidence
      });
      return;
    }
    
    const { error } = await supabase
      .from('extraction_logs')
      .insert([{
        tenant_id: data.tenantId,
        lead_id: data.leadId,
        conversation_id: data.conversationId,
        extraction_data: data.extraction || null,
        insights: data.insights || [],
        error: data.error || null,
        status: data.status || 'completed',
        trigger: data.trigger,
        processing_time_ms: data.processingTime,
        confidence_score: data.extraction?.overallConfidence || 0,
        auto_updated: data.autoUpdated || false,
        created_at: new Date()
      }]);
    
    if (error) {
      console.error('Failed to log extraction:', error);
    }
  } catch (error) {
    console.error('Error logging extraction:', error);
  }
}

/**
 * Queue extraction for manual review
 */
async function queueManualReview(data) {
  try {
    if (!supabase) {
      console.log('📋 Mock manual review queued:', data.leadId);
      return;
    }
    
    const { error } = await supabase
      .from('manual_review_queue')
      .insert([{
        tenant_id: data.tenantId,
        lead_id: data.leadId,
        extraction_data: data.extraction,
        reason: data.reason,
        status: 'pending',
        created_at: new Date()
      }]);
    
    if (error) {
      console.error('Failed to queue manual review:', error);
    }
    
    // TODO: Send notification to admin
    console.log(`📋 Lead ${data.leadId} queued for manual review`);
    
  } catch (error) {
    console.error('Error queuing manual review:', error);
  }
}

/**
 * Handle escalation
 */
async function handleEscalation(data) {
  try {
    const conversationService = new ConversationService(data.tenantId);
    
    // Pause AI for this conversation
    await conversationService.pauseAI(data.conversationId, data.reason);
    
    // Update lead status in CRM
    const adapter = await CRMFactory.getAdapter(data.tenantId);
    await adapter.updateLead(data.leadId, {
      ai_paused: true,
      escalation_reason: data.reason,
      escalation_timestamp: new Date().toISOString()
    });
    
    // Add note to CRM
    await adapter.addActivity(data.leadId, {
      type: 'note',
      content: `AI paused - Escalation: ${data.reason}. ${data.context || ''}`,
      metadata: {
        escalation: true,
        reason: data.reason
      }
    });
    
    // TODO: Send notification to assigned agent
    console.log(`🚨 Escalation handled for lead ${data.leadId}: ${data.reason}`);
    
  } catch (error) {
    console.error('Error handling escalation:', error);
  }
}

/**
 * Batch extraction processor for multiple leads
 */
async function processBatchExtraction(job) {
  const { tenantId, leadIds, options = {} } = job.data;
  const results = [];
  
  console.log(`📦 Processing batch extraction for ${leadIds.length} leads`);
  
  for (const leadId of leadIds) {
    try {
      // Create individual extraction job
      const individualJob = {
        data: {
          tenantId,
          leadId,
          trigger: 'batch',
          options
        },
        progress: async () => {}
      };
      
      const result = await processExtractionJob(individualJob);
      results.push(result);
      
      // Update batch progress
      const progress = Math.round((results.length / leadIds.length) * 100);
      await job.progress(progress);
      
    } catch (error) {
      console.error(`Failed to extract for lead ${leadId}:`, error);
      results.push({
        success: false,
        leadId,
        error: error.message
      });
    }
  }
  
  console.log(`✅ Batch extraction completed: ${results.filter(r => r.success).length}/${leadIds.length} successful`);
  
  return {
    success: true,
    totalLeads: leadIds.length,
    successfulExtractions: results.filter(r => r.success).length,
    failedExtractions: results.filter(r => !r.success).length,
    results
  };
}

/**
 * Main processor function
 */
module.exports = async function(job) {
  console.log(`📋 Extraction job ${job.id} started`);
  
  // Check if this is a batch job
  if (job.data.leadIds && Array.isArray(job.data.leadIds)) {
    return processBatchExtraction(job);
  }
  
  // Process single extraction
  return processExtractionJob(job);
};