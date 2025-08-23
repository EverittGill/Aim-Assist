/**
 * Conversation Summarizer Service
 * Intelligently summarizes older messages to preserve context within token limits
 */

class ConversationSummarizer {
  constructor() {
    this.maxRecentMessages = 10; // Keep last 10 messages in full
    this.maxSummaryLength = 500; // Max chars for summary
  }

  /**
   * Process conversation history into optimized format for AI
   * @param {Array} messages - Full conversation history
   * @param {Object} leadDetails - Lead information
   * @returns {Object} Processed conversation with summary and recent messages
   */
  processConversation(messages, leadDetails) {
    if (!messages || messages.length === 0) {
      return {
        summary: null,
        recentMessages: [],
        extractedFacts: {},
        totalMessages: 0
      };
    }

    // Split messages into older and recent
    const recentMessages = messages.slice(-this.maxRecentMessages);
    const olderMessages = messages.slice(0, -this.maxRecentMessages);

    // Extract key facts from entire conversation
    const extractedFacts = this.extractKeyFacts(messages, leadDetails);

    // Generate summary of older messages if they exist
    let summary = null;
    if (olderMessages.length > 0) {
      summary = this.generateSummary(olderMessages, extractedFacts);
    }

    return {
      summary,
      recentMessages,
      extractedFacts,
      totalMessages: messages.length,
      olderMessageCount: olderMessages.length,
      recentMessageCount: recentMessages.length
    };
  }

  /**
   * Extract key facts from conversation
   * @param {Array} messages - All messages
   * @param {Object} leadDetails - Lead information
   * @returns {Object} Extracted facts
   */
  extractKeyFacts(messages, leadDetails) {
    const facts = {
      timeline: null,
      agentStatus: null,
      financing: null,
      propertyPreferences: [],
      priceRange: null,
      location: null,
      propertyType: null,
      motivation: null,
      concerns: [],
      previousProperties: [],
      familyInfo: null,
      currentSituation: null
    };

    // Patterns for extraction
    const patterns = {
      timeline: /(\d+)\s*(month|week|year|day)|soon|asap|immediately|no rush|flexible/i,
      price: /\$?([\d,]+)k?|\$?([\d,]+)\s*(thousand|million)|budget|afford|price|cost/i,
      location: /(looking|interested|want|need)\s*(in|at|near)\s+([A-Za-z\s]+)|area|neighborhood|city|town/i,
      propertyType: /\b(house|condo|townhouse|apartment|single family|multi-family|duplex|land|commercial)\b/i,
      bedrooms: /(\d+)\s*(bed|br|bedroom)/i,
      bathrooms: /(\d+)\s*(bath|ba|bathroom)/i,
      agentStatus: /agent|realtor|working with|represented|have someone/i,
      financing: /pre-?approved|cash|loan|mortgage|lender|bank|financing/i,
      motivation: /job|family|school|downsize|upsize|investment|relocat/i
    };

    messages.forEach(msg => {
      const content = (msg.content || msg.text || msg.body || '').toLowerCase();
      const isLeadMessage = msg.direction === 'inbound' || msg.sender === leadDetails.name;

      if (isLeadMessage) {
        // Extract timeline
        if (!facts.timeline && patterns.timeline.test(content)) {
          const match = content.match(patterns.timeline);
          facts.timeline = match[0];
        }

        // Extract price range
        if (!facts.priceRange && patterns.price.test(content)) {
          const match = content.match(patterns.price);
          facts.priceRange = this.normalizePriceRange(match[0]);
        }

        // Extract location preferences
        const locationMatch = content.match(patterns.location);
        if (locationMatch && locationMatch[3]) {
          facts.location = locationMatch[3].trim();
        }

        // Extract property type
        const propertyMatch = content.match(patterns.propertyType);
        if (propertyMatch) {
          facts.propertyType = propertyMatch[1];
        }

        // Extract bedrooms/bathrooms
        const bedroomMatch = content.match(patterns.bedrooms);
        if (bedroomMatch) {
          if (!facts.propertyPreferences.includes(`${bedroomMatch[1]} bedrooms`)) {
            facts.propertyPreferences.push(`${bedroomMatch[1]} bedrooms`);
          }
        }

        const bathroomMatch = content.match(patterns.bathrooms);
        if (bathroomMatch) {
          if (!facts.propertyPreferences.includes(`${bathroomMatch[1]} bathrooms`)) {
            facts.propertyPreferences.push(`${bathroomMatch[1]} bathrooms`);
          }
        }

        // Extract agent status
        if (!facts.agentStatus && patterns.agentStatus.test(content)) {
          facts.agentStatus = content.includes('not') || content.includes("don't") ? 
            'No agent' : 'Has agent';
        }

        // Extract financing
        if (!facts.financing && patterns.financing.test(content)) {
          if (content.includes('cash')) {
            facts.financing = 'Cash buyer';
          } else if (content.includes('pre-approved') || content.includes('preapproved')) {
            facts.financing = 'Pre-approved';
          } else {
            facts.financing = 'Needs financing';
          }
        }

        // Extract motivation
        if (!facts.motivation && patterns.motivation.test(content)) {
          const motivationMatch = content.match(patterns.motivation);
          if (motivationMatch) {
            facts.motivation = motivationMatch[0];
          }
        }
      }
    });

    return facts;
  }

  /**
   * Generate a concise summary of older messages
   * @param {Array} olderMessages - Messages to summarize
   * @param {Object} extractedFacts - Already extracted facts
   * @returns {String} Summary text
   */
  generateSummary(olderMessages, extractedFacts) {
    const leadMessages = olderMessages.filter(m => 
      m.direction === 'inbound' || m.sender !== 'Eugenia'
    );

    const eugeniaMessages = olderMessages.filter(m => 
      m.direction === 'outbound' || m.sender === 'Eugenia'
    );

    let summary = `Previous conversation (${olderMessages.length} messages): `;

    // Add key facts if found
    const factsSummary = [];
    if (extractedFacts.timeline) factsSummary.push(`Timeline: ${extractedFacts.timeline}`);
    if (extractedFacts.priceRange) factsSummary.push(`Budget: ${extractedFacts.priceRange}`);
    if (extractedFacts.location) factsSummary.push(`Location: ${extractedFacts.location}`);
    if (extractedFacts.propertyType) factsSummary.push(`Type: ${extractedFacts.propertyType}`);
    if (extractedFacts.agentStatus) factsSummary.push(extractedFacts.agentStatus);
    if (extractedFacts.financing) factsSummary.push(extractedFacts.financing);

    if (factsSummary.length > 0) {
      summary += `Lead shared: ${factsSummary.join(', ')}. `;
    }

    // Add engagement summary
    summary += `Lead sent ${leadMessages.length} messages, showing ${this.getEngagementLevel(leadMessages)}.`;

    // Ensure summary doesn't exceed max length
    if (summary.length > this.maxSummaryLength) {
      summary = summary.substring(0, this.maxSummaryLength - 3) + '...';
    }

    return summary;
  }

  /**
   * Determine engagement level based on messages
   * @param {Array} leadMessages - Lead's messages
   * @returns {String} Engagement level description
   */
  getEngagementLevel(leadMessages) {
    const avgLength = leadMessages.reduce((sum, msg) => {
      const content = msg.content || msg.text || msg.body || '';
      return sum + content.length;
    }, 0) / leadMessages.length;

    if (avgLength > 50) return 'high engagement';
    if (avgLength > 20) return 'moderate engagement';
    return 'low engagement';
  }

  /**
   * Normalize price range extraction
   * @param {String} priceText - Raw price text
   * @returns {String} Normalized price range
   */
  normalizePriceRange(priceText) {
    const cleanText = priceText.replace(/[,$]/g, '');
    const match = cleanText.match(/(\d+)/);
    
    if (!match) return priceText;
    
    let value = parseInt(match[1]);
    
    // Convert shorthand (e.g., "450k" to "$450,000")
    if (priceText.includes('k')) {
      value = value * 1000;
    } else if (priceText.includes('million')) {
      value = value * 1000000;
    } else if (value < 10000) {
      // Assume it's in thousands if the number is small
      value = value * 1000;
    }
    
    // Format with commas
    return `$${value.toLocaleString()}`;
  }

  /**
   * Format conversation for AI prompt with smart windowing
   * @param {Object} processedConvo - Result from processConversation
   * @param {String} leadName - Lead's name
   * @returns {String} Formatted conversation history
   */
  formatForPrompt(processedConvo, leadName) {
    let formatted = '';

    // Add summary if exists
    if (processedConvo.summary) {
      formatted += `${processedConvo.summary}\n\n`;
    }

    // Add recent messages
    if (processedConvo.recentMessages.length > 0) {
      formatted += 'Recent conversation:\n';
      processedConvo.recentMessages.forEach(msg => {
        const content = msg.content || msg.text || msg.body || '';
        const sender = msg.direction === 'inbound' ? leadName : 'Eugenia';
        formatted += `${sender}: ${content}\n`;
      });
    }

    return formatted;
  }
}

module.exports = new ConversationSummarizer();