/**
 * Processes tag polling jobs
 * Polls CRM for leads with specific tags
 */

const TagPollingService = require('../../services/TagPollingService');

module.exports = async function processTagPoll(job) {
  const { 
    tenantId, 
    tagName = 'AIM_ASSIST',
    processImmediately = true,
    enableAI = true,
    sendAutoText = true,
    sinceMinutesAgo = 60
  } = job.data;
  
  console.log(`🏷️  Processing tag poll job ${job.id} for tag "${tagName}" (tenant: ${tenantId})`);
  
  try {
    const pollService = new TagPollingService(tenantId);
    
    const result = await pollService.pollForTag(tagName, {
      processImmediately,
      enableAI,
      sendAutoText,
      sinceMinutesAgo
    });
    
    console.log(`✅ Tag poll completed: ${result.stats.processed} leads processed, ${result.stats.new} new, ${result.stats.updated} updated`);
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error(`❌ Tag poll job ${job.id} failed:`, error);
    throw error;
  }
};