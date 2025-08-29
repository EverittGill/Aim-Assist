/**
 * Processes auto-text jobs
 * Sends automated messages to new leads
 * Respects business hours and settings
 */

const LeadService = require('../../services/LeadService');
const AIService = require('../../services/ai/AIService');
const queueManager = require('../QueueManager');

module.exports = async function processAutoText(job) {
  const {
    organizationId,
    organizationId, // Accept both during migration
    leadId,
    templateId,
    delay
  } = job.data;
  
  // Use organizationId if provided, fallback to organizationId
  const orgId = organizationId || organizationId;
  
  console.log(`🤖 Processing auto-text job ${job.id} for lead ${leadId}`);
  
  try {
    // Check if lead still eligible
    const shouldRespond = await LeadService.shouldAIRespond(orgId, leadId);
    if (!shouldRespond) {
      console.log(`Lead ${leadId} no longer eligible for auto-text`);
      return { success: false, reason: 'Lead not eligible' };
    }
    
    // Get lead details
    const lead = await LeadService.getById(orgId, leadId);
    if (!lead) {
      throw new Error('Lead not found');
    }
    
    // Generate message using AI
    const aiService = new AIService(orgId);
    const message = await aiService.generateInitialOutreach({
      lead,
      templateId
    });
    
    // Queue SMS for sending
    await queueManager.queueSMS({
      organizationId: orgId,
      organizationId: orgId,
      leadId,
      to: lead.phone,
      message: message.content,
      conversationId: message.conversationId
    });
    
    // Update lead status
    await LeadService.updateAIStatus(leadId, 'active');
    
    console.log(`✅ Auto-text queued for lead ${leadId}`);
    
    return {
      success: true,
      leadId,
      message: message.content
    };
  } catch (error) {
    console.error(`❌ Auto-text job ${job.id} failed:`, error);
    throw error;
  }
};