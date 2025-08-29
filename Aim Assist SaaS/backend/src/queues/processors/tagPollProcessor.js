/**
 * Processes tag polling jobs
 * Polls CRM for leads with specific tags
 */

const TagPollingService = require('../../services/TagPollingService');

module.exports = async function processTagPoll(job) {
  const { 
    organizationId, 
    organizationId, // Accept both during migration
    tagName = 'AIM_ASSIST',
    processImmediately = true,
    enableAI = true,
    sendAutoText = true,
    sinceMinutesAgo = 60
  } = job.data;
  
  // Use organizationId if provided, fallback to organizationId
  const orgId = organizationId || organizationId;
  
  console.log(`🏷️  Processing tag poll job ${job.id} for tag "${tagName}" (tenant: ${orgId})`);
  
  try {
    const pollService = new TagPollingService(orgId);
    
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