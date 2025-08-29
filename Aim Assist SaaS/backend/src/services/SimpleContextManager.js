/**
 * Simple Context Manager for Multi-Tenant System
 * Works with new database schema (organization_id, not organization_id)
 * Provides conversation history and extracted facts to AI
 */

const { supabase } = require('../config/supabase');

class SimpleContextManager {
  constructor(organizationId) {
    this.organizationId = organizationId;
  }

  /**
   * Get full conversation history for a lead
   */
  async getConversation(leadId) {
    try {
      // First check if leadId is a UUID or CRM ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
      
      let dbLeadId = leadId;
      
      // If it's a CRM ID, look up the database ID
      if (!isUUID) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', this.organizationId)
          .eq('fub_lead_id', leadId)  // Fixed to use only fub_lead_id
          .single();
        
        if (lead) {
          dbLeadId = lead.id;
        } else {
          console.log(`Lead ${leadId} not found in database`);
          return [];
        }
      }
      
      // Get or create conversation
      const { data: conversationId } = await supabase.rpc('get_or_create_conversation', {
        p_lead_id: dbLeadId
      });
      
      if (!conversationId) {
        console.log('No conversation found');
        return [];
      }
      
      // Get messages
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (error) {
        console.error('Error fetching messages:', error);
        return [];
      }
      
      return messages || [];
    } catch (error) {
      console.error('Error in getConversation:', error);
      return [];
    }
  }

  /**
   * Extract key facts from conversation using simple patterns
   */
  extractFacts(messages) {
    const facts = {};
    
    // Combine all message text
    const allText = messages
      .map(m => m.content || '')
      .join(' ')
      .toLowerCase();
    
    // Extract budget
    const budgetMatch = allText.match(/\$?([\d,]+)k|\$?([\d,]+(?:\.\d+)?)\s*(?:thousand|million)|\$?([\d,]+)/);
    if (budgetMatch) {
      let amount = budgetMatch[1] || budgetMatch[2] || budgetMatch[3];
      amount = amount.replace(/,/g, '');
      
      if (budgetMatch[0].includes('k')) {
        facts.budget = `$${amount}k`;
      } else if (budgetMatch[0].includes('million')) {
        facts.budget = `$${parseFloat(amount)}M`;
      } else if (parseInt(amount) > 10000) {
        facts.budget = `$${parseInt(amount).toLocaleString()}`;
      }
    }
    
    // Extract timeline
    const timelinePatterns = [
      /(?:move|moving|buy|purchase)\s+(?:in|within)?\s*(\d+[\s-]?(?:days?|weeks?|months?))/,
      /(?:next|this)\s+(week|month|year)/,
      /(?:by|before)\s+(\w+\s+\d+)/,
      /asap|immediately|right away|urgent/
    ];
    
    for (const pattern of timelinePatterns) {
      const match = allText.match(pattern);
      if (match) {
        facts.timeline = match[1] || match[0];
        break;
      }
    }
    
    // Extract location preferences
    if (allText.includes('school')) {
      facts.wantsGoodSchools = true;
    }
    
    const locationMatch = allText.match(/(?:in|near|around)\s+([a-z]+(?:\s+[a-z]+)?)/);
    if (locationMatch) {
      facts.preferredArea = locationMatch[1];
    }
    
    // Extract property type
    const propertyTypes = {
      'house': /\bhouse\b/,
      'condo': /\bcondo|condominium\b/,
      'townhouse': /\btownhouse|townhome\b/,
      '3-bedroom': /\b3[\s-]?bed(?:room)?\b/,
      '4-bedroom': /\b4[\s-]?bed(?:room)?\b/
    };
    
    for (const [type, pattern] of Object.entries(propertyTypes)) {
      if (pattern.test(allText)) {
        facts.propertyType = type;
        break;
      }
    }
    
    // Extract financing status
    if (/pre[\s-]?approved/.test(allText)) {
      facts.financing = 'pre-approved';
      const approvalAmount = allText.match(/pre[\s-]?approved\s+for\s+\$?([\d,]+)/);
      if (approvalAmount) {
        facts.preApprovalAmount = `$${approvalAmount[1]}`;
      }
    } else if (/cash/.test(allText)) {
      facts.financing = 'cash';
    }
    
    // Extract agent status
    if (/(?:have|working with)\s+(?:an?\s+)?(?:agent|realtor)/.test(allText)) {
      facts.hasAgent = true;
    } else if (/(?:no|don't have|need)\s+(?:an?\s+)?(?:agent|realtor)/.test(allText)) {
      facts.hasAgent = false;
    }
    
    return facts;
  }

  /**
   * Build a summary of known facts
   */
  buildSummary(facts) {
    const parts = [];
    
    if (facts.budget) parts.push(`Budget: ${facts.budget}`);
    if (facts.timeline) parts.push(`Timeline: ${facts.timeline}`);
    if (facts.propertyType) parts.push(`Looking for: ${facts.propertyType}`);
    if (facts.preferredArea) parts.push(`Area: ${facts.preferredArea}`);
    if (facts.wantsGoodSchools) parts.push('Wants good schools');
    if (facts.financing) parts.push(`Financing: ${facts.financing}`);
    if (facts.preApprovalAmount) parts.push(`Pre-approved for: ${facts.preApprovalAmount}`);
    if (facts.hasAgent !== undefined) {
      parts.push(facts.hasAgent ? 'Has an agent' : 'No agent');
    }
    
    return parts.length > 0 ? parts.join(', ') : 'No key facts extracted yet';
  }

  /**
   * Format context for AI
   */
  formatForAI(messages, facts) {
    // Get last 20 messages for context
    const recentMessages = messages.slice(-20);
    
    // Format conversation
    const conversation = recentMessages.map(msg => {
      const sender = msg.sender_type === 'lead' ? 'Lead' : 'AI';
      return `${sender}: ${msg.content}`;
    }).join('\n');
    
    // Build "what you know" section
    const knownFacts = this.buildSummary(facts);
    
    return {
      recentConversation: conversation || 'No previous messages',
      knownFacts,
      messageCount: messages.length,
      extractedFacts: facts
    };
  }

  /**
   * Get complete context for AI response generation
   */
  async getFullContext(leadId, currentMessage = null) {
    try {
      console.log(`📚 Building context for lead ${leadId}`);
      
      // Get conversation history
      const messages = await this.getConversation(leadId);
      console.log(`  Found ${messages.length} messages`);
      
      // Extract facts from conversation
      const facts = this.extractFacts(messages);
      console.log(`  Extracted facts:`, facts);
      
      // Format for AI
      const formatted = this.formatForAI(messages, facts);
      
      // Get lead info
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, source, tags')
        .eq('organization_id', this.organizationId)
        .or(`id.eq.${leadId},fub_lead_id.eq.${leadId}`)  // Fixed to remove crm_lead_id
        .single();
      
      return {
        messages,
        facts,
        summary: this.buildSummary(facts),
        formatted,
        leadInfo: lead || {},
        currentMessage
      };
    } catch (error) {
      console.error('Error getting full context:', error);
      return {
        messages: [],
        facts: {},
        summary: 'No context available',
        formatted: {
          recentConversation: 'No previous messages',
          knownFacts: 'No facts extracted',
          messageCount: 0
        },
        leadInfo: {},
        currentMessage
      };
    }
  }

  /**
   * Check if a question has already been answered
   */
  hasAnswered(facts, topic) {
    const topicMap = {
      'budget': ['budget', 'preApprovalAmount'],
      'timeline': ['timeline'],
      'location': ['preferredArea', 'wantsGoodSchools'],
      'property': ['propertyType'],
      'financing': ['financing', 'preApprovalAmount'],
      'agent': ['hasAgent']
    };
    
    const relevantFields = topicMap[topic] || [];
    return relevantFields.some(field => facts[field] !== undefined);
  }
}

module.exports = SimpleContextManager;