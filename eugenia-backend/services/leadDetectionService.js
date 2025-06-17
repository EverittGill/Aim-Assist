// Lead Detection Service
// Scans FUB for new leads that need AI outreach

class LeadDetectionService {
  constructor(fubService) {
    this.fubService = fubService;
  }

  // Scan for new leads that need AI outreach
  async scanForNewLeads(options = {}) {
    try {
      const requiredTags = options.tags || ['direct connect', 'ppc'];
      const skipRecentContactCheck = options.skipRecentContactCheck || false;
      
      console.log(`🔍 Scanning FUB for new leads with tags: ${requiredTags.join(', ')}...`);
      
      // Fetch all leads from FUB
      const allLeads = await this.fubService.fetchLeads(500, 0);
      
      // Filter for leads that need AI outreach
      const eligibleLeads = allLeads.filter(lead => {
        // Check for required tags
        const hasRequiredTag = lead.tags.some(tag => 
          requiredTags.some(reqTag => tag.toLowerCase() === reqTag.toLowerCase())
        );
        
        // Check phone validity
        const hasValidPhone = lead.hasValidPhone;
        
        // Check if AI is already active (custom field)
        const eugeniaStatus = lead.customFields?.find(
          cf => cf.name === process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME
        )?.value;
        const isAIActive = eugeniaStatus === 'active';
        
        // Check if lead has been contacted recently (within last 24 hours)
        const lastContacted = lead.lastContacted ? new Date(lead.lastContacted) : null;
        const daysSinceContact = lastContacted 
          ? (Date.now() - lastContacted.getTime()) / (1000 * 60 * 60 * 24)
          : Infinity;
        const isRecentlyContacted = !skipRecentContactCheck && daysSinceContact < 1;
        
        // Lead is eligible if:
        // 1. Has required tag
        // 2. Has valid phone number
        // 3. AI is not already active
        // 4. Has not been contacted in last 24 hours (unless skipped)
        const isEligible = hasRequiredTag && hasValidPhone && !isAIActive && !isRecentlyContacted;
        
        if (hasRequiredTag && !isEligible) {
          console.log(`  Lead ${lead.name} has tag but is not eligible:`);
          if (!hasValidPhone) console.log('    - No valid phone number');
          if (isAIActive) console.log('    - AI already active');
          if (isRecentlyContacted) console.log('    - Recently contacted');
        }
        
        return isEligible;
      });
      
      console.log(`Found ${eligibleLeads.length} eligible leads for AI outreach`);
      return eligibleLeads;
    } catch (error) {
      console.error('Error scanning for new leads:', error);
      throw error;
    }
  }

  // Check if a specific lead needs AI outreach
  async checkLeadEligibility(leadId, options = {}) {
    try {
      const requiredTags = options.tags || ['direct connect', 'ppc'];
      const skipRecentContactCheck = options.skipRecentContactCheck || false;
      
      const lead = await this.fubService.getLeadById(leadId);
      
      if (!lead) {
        return { eligible: false, reason: 'Lead not found' };
      }
      
      // Check for required tags
      const hasRequiredTag = lead.tags?.some(tag => 
        requiredTags.some(reqTag => tag.toLowerCase() === reqTag.toLowerCase())
      );
      
      if (!hasRequiredTag) {
        return { eligible: false, reason: `Missing required tag (${requiredTags.join(' or ')})` };
      }
      
      // Check phone validity
      if (!lead.phone || !this.fubService.isValidPhoneNumber(lead.phone)) {
        return { eligible: false, reason: 'No valid phone number' };
      }
      
      // Check if AI is already active
      const eugeniaStatus = lead.customFields?.find(
        cf => cf.name === process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME
      )?.value;
      
      if (eugeniaStatus === 'active') {
        return { eligible: false, reason: 'AI already active for this lead' };
      }
      
      // Check recent contact
      const lastContacted = lead.lastContacted ? new Date(lead.lastContacted) : null;
      const daysSinceContact = lastContacted 
        ? (Date.now() - lastContacted.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;
        
      if (!skipRecentContactCheck && daysSinceContact < 1) {
        return { eligible: false, reason: 'Lead contacted within last 24 hours' };
      }
      
      return { 
        eligible: true, 
        reason: 'Lead meets all criteria for AI outreach',
        lead: lead
      };
    } catch (error) {
      console.error('Error checking lead eligibility:', error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  }

  // Process a batch of leads for initial outreach
  async processLeadsForOutreach(leads, options = {}) {
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    const maxBatchSize = options.maxBatchSize || 10;
    const delayBetweenLeads = options.delayMs || 2000; // 2 seconds between leads
    
    // Process only the first batch to avoid overwhelming the system
    const leadsToProcess = leads.slice(0, maxBatchSize);
    
    console.log(`Processing ${leadsToProcess.length} leads for initial outreach...`);
    
    for (const lead of leadsToProcess) {
      try {
        console.log(`\nProcessing lead: ${lead.name} (ID: ${lead.id})`);
        
        // Double-check eligibility
        const eligibility = await this.checkLeadEligibility(lead.id);
        if (!eligibility.eligible) {
          console.log(`  Skipped: ${eligibility.reason}`);
          results.skipped.push({ lead, reason: eligibility.reason });
          continue;
        }
        
        // Mark as processing
        results.successful.push({
          lead,
          status: 'ready_for_outreach',
          message: 'Lead eligible for AI outreach'
        });
        
        // Add delay between leads
        if (delayBetweenLeads > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenLeads));
        }
      } catch (error) {
        console.error(`  Failed to process lead ${lead.name}:`, error.message);
        results.failed.push({ lead, error: error.message });
      }
    }
    
    return results;
  }
}

module.exports = LeadDetectionService;