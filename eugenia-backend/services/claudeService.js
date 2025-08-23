const Anthropic = require('@anthropic-ai/sdk');
const promptService = require('./promptService');
const qualificationService = require('./qualificationService');
const devModeService = require('./devModeService');
const conversationSummarizer = require('./conversationSummarizer');
const leadScoringService = require('./leadScoringService');

class ClaudeService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }
    console.log('🔑 Claude API key provided:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');
    
    this.client = new Anthropic({
      apiKey: apiKey
    });
    
    console.log('Claude Sonnet 4 configured successfully');
  }

  async generateInitialOutreach(leadDetails, agencyName) {
    const prompt = this.buildInitialOutreachPrompt(leadDetails, agencyName);
    
    try {
      console.log('🤖 Generating initial outreach with Claude...');
      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let response = message.content[0].text.trim();
      
      // Clean up any explanation text from Claude (remove everything after first newline)
      if (response.includes('\n')) {
        response = response.split('\n')[0].trim();
      }
      
      console.log(`✅ Claude generated initial outreach: "${response}"`);
      return response;
    } catch (error) {
      console.error('Error generating initial outreach with Claude:', error);
      throw new Error('Failed to generate AI message');
    }
  }

  async generateReply(leadDetails, conversationHistory, currentMessage, agencyName) {
    // Analyze qualification status
    const allMessages = [...conversationHistory];
    if (currentMessage) {
      allMessages.push({
        direction: 'inbound',
        content: currentMessage,
        timestamp: new Date()
      });
    }
    
    const qualificationStatus = qualificationService.analyzeQualificationStatus(allMessages);
    console.log(`📊 ${qualificationService.getQualificationSummary(qualificationStatus)}`);
    
    // Calculate lead score for intelligent response
    const leadScore = leadScoringService.calculateScore(leadDetails, allMessages, qualificationStatus);
    console.log(`🎯 Lead Score: ${leadScore.total.toFixed(1)}/100 - ${leadScore.grade}`);
    if (leadScore.insights.length > 0) {
      console.log(`💡 Insights: ${leadScore.insights.join(' | ')}`);
    }
    
    // Process conversation with smart windowing
    const processedConvo = conversationSummarizer.processConversation(conversationHistory, leadDetails);
    const formattedHistory = conversationSummarizer.formatForPrompt(processedConvo, leadDetails.name);
    console.log(`📚 Context: ${processedConvo.olderMessageCount} older msgs summarized, ${processedConvo.recentMessageCount} recent msgs in full`);
    
    console.log(`📊 Generating Claude reply with context:
    - Lead: ${leadDetails.name} (ID: ${leadDetails.id})
    - First Name: ${leadDetails.firstName}
    - Conversation Messages: ${conversationHistory.length}
    - Qualification Complete: ${qualificationStatus.qualificationComplete}`);

    // Build comprehensive lead context
    const enhancedLeadDetails = {
      ...leadDetails,
      tagsString: leadDetails.tags?.join(', ') || 'None',
      emailString: leadDetails.email || leadDetails.emails?.[0]?.value || 'Not provided',
      phoneString: leadDetails.phone || leadDetails.phones?.[0]?.value || 'Not provided',
      customFieldsString: this.formatCustomFields(leadDetails.customFields),
      notesString: leadDetails.notes || leadDetails.background || 'No notes',
      extractedFacts: processedConvo.extractedFacts,
      leadScore: leadScore
    };
    
    const prompt = this.buildConversationPrompt({
      agencyName,
      leadDetails: enhancedLeadDetails,
      conversationHistory: formattedHistory,
      currentMessage,
      qualificationStatus
    });
    
    console.log('📝 Prompt built, length:', prompt.length);
    
    try {
      // Dynamic temperature based on conversation stage
      const temperature = this.getDynamicTemperature(leadScore, qualificationStatus, allMessages.length);
      console.log(`🌡️ Using temperature: ${temperature} (based on lead score and stage)`);
      
      console.log('🧠 Sending prompt to Claude...');
      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let response = message.content[0].text.trim();
      
      // Clean up any explanation text from Claude (remove everything after first newline)
      if (response.includes('\n')) {
        response = response.split('\n')[0].trim();
      }
      
      console.log(`✅ Claude generated reply: "${response}"`);
      
      // Validate SMS length
      if (response.length > 160) {
        console.warn(`⚠️ Response too long for SMS (${response.length} chars), truncating...`);
        response = response.substring(0, 157) + '...';
      }
      
      // Check for escalation conditions and qualification status
      const escalationResult = this.checkEscalationTriggers(response, currentMessage, qualificationStatus, leadDetails);
      
      return {
        message: response,
        shouldPause: escalationResult.shouldPause,
        pauseReason: escalationResult.reason,
        isQualificationComplete: qualificationStatus.qualificationComplete,
        qualificationStatus: qualificationStatus,
        followUpMessage: escalationResult.followUpMessage
      };
    } catch (error) {
      console.error('Error generating reply with Claude:', error);
      throw new Error('Failed to generate AI reply');
    }
  }

  // Method to handle frontend requests with provided conversation history
  async generateReplyFromFrontend(leadDetails, conversationHistory, lastMessageText, agencyName, fullLeadContext) {
    const completeLeadDetails = fullLeadContext || leadDetails;
    return this.generateReply(completeLeadDetails, conversationHistory, lastMessageText, agencyName);
  }
  
  // Format custom fields for prompt
  formatCustomFields(customFields) {
    if (!customFields || customFields.length === 0) {
      return 'None';
    }
    
    return customFields
      .filter(cf => cf.value) // Only include fields with values
      .map(cf => `${cf.name}: ${cf.value}`)
      .join(', ');
  }
  
  /**
   * Get dynamic temperature based on conversation context
   */
  getDynamicTemperature(leadScore, qualificationStatus, messageCount) {
    // Hot leads need more focused responses
    if (leadScore.total >= 85) {
      return 0.3; // Very focused, direct
    }
    
    // Qualification questions need consistency
    if (!qualificationStatus.qualificationComplete && messageCount < 5) {
      return 0.4; // Consistent qualification approach
    }
    
    // Building rapport needs more creativity
    if (leadScore.engagement < 50) {
      return 0.8; // More creative to boost engagement
    }
    
    // Default balanced temperature
    return 0.6;
  }
  
  buildInitialOutreachPrompt(leadDetails, agencyName) {
    // Try to get custom prompt first
    const customPromptFunc = promptService.getExecutablePrompt('initialOutreach');
    const customPrompt = customPromptFunc({ agencyName, leadDetails });
    
    // If custom prompt exists and is reasonable, use it
    if (customPrompt && customPrompt.length > 50) {
      return customPrompt;
    }
    
    // Otherwise use Claude-optimized prompt
    const leadName = leadDetails.firstName || leadDetails.name || 'there';
    const source = leadDetails.source || 'our website';
    
    return `You are Eugenia, a friendly real estate assistant for ${agencyName}.

Generate a natural, warm initial text message to ${leadName} who expressed interest through ${source}.

Requirements:
- Keep under 160 characters for SMS
- Be conversational and friendly, not robotic
- Reference their source naturally
- Ask about their timeline to find a home
- Do NOT use emojis
- Do NOT mention specific properties unless they inquired about one

Generate only the message text, nothing else.`;
  }
  
  buildConversationPrompt({ agencyName, leadDetails, conversationHistory, currentMessage, qualificationStatus }) {
    // Try to get custom prompt first
    const customPromptFunc = promptService.getExecutablePrompt('conversationReply');
    const customPrompt = customPromptFunc({ 
      agencyName, 
      leadDetails,
      conversationHistory,
      currentMessage,
      qualificationStatus
    });
    
    // If custom prompt exists and is reasonable, use it
    if (customPrompt && customPrompt.length > 50) {
      return customPrompt;
    }
    
    // Otherwise use Claude-optimized prompt with chain-of-thought
    const leadName = leadDetails.firstName || leadDetails.name || 'there';
    const score = leadDetails.leadScore || { total: 50, engagement: 50, grade: 'Unknown' };
    const facts = leadDetails.extractedFacts || {};
    
    // Determine conversation strategy based on score
    let strategy = '';
    let focusPoint = '';
    
    if (score.total >= 85) {
      strategy = 'This is a HOT lead. Be direct and move toward scheduling.';
      focusPoint = 'Suggest scheduling a call or property tour.';
    } else if (score.total >= 70) {
      strategy = 'This is a WARM lead. Focus on missing qualification info.';
      if (!qualificationStatus.qualifyingQuestions?.timeline?.answered) {
        focusPoint = 'Discover their timeline to buy/sell.';
      } else if (!qualificationStatus.qualifyingQuestions?.financing?.answered) {
        focusPoint = 'Ask about financing (pre-approved or cash).';
      } else {
        focusPoint = 'Move toward scheduling next steps.';
      }
    } else if (score.engagement < 50) {
      strategy = 'Low engagement detected. Try a different approach to spark interest.';
      focusPoint = 'Ask an engaging question about their dream home or situation.';
    } else {
      strategy = 'Build rapport and gather information.';
      focusPoint = 'Continue qualifying naturally.';
    }
    
    // Build facts summary for context
    let factsSummary = '';
    if (facts.timeline) factsSummary += `Timeline: ${facts.timeline}. `;
    if (facts.priceRange) factsSummary += `Budget: ${facts.priceRange}. `;
    if (facts.location) factsSummary += `Location: ${facts.location}. `;
    if (facts.propertyType) factsSummary += `Type: ${facts.propertyType}. `;
    
    return `You are Eugenia, an expert real estate ISA for ${agencyName}.

LEAD INTELLIGENCE:
- Name: ${leadName}
- Score: ${score.grade} (${score.total ? score.total.toFixed(0) : '?'}/100)
- ${factsSummary || 'Limited information gathered so far.'}
- Insights: ${score.insights ? score.insights.join(', ') : 'Still assessing lead quality.'}

STRATEGY: ${strategy}

CONVERSATION:
${conversationHistory}

Their latest message: "${currentMessage}"

Think step by step:
1. What key information do they reveal in this message?
2. What's the most important thing to discover or accomplish next?
3. How can I move them closer to scheduling with an agent?

Based on this analysis, generate a response that:
- Is under 160 characters for SMS
- ${focusPoint}
- Sounds natural and conversational, not scripted
- Shows you remember what they've already shared
- NO emojis
- If they want to schedule or speak with agent, confirm the agent will call them

Generate only the message text, nothing else.`;
  }
  
  checkEscalationTriggers(message, originalMessage, qualificationStatus, leadDetails) {
    const leadId = leadDetails.id;
    
    // Check if dev mode is enabled for this lead
    const isLeadInDevMode = leadId && devModeService.isDevModeEnabled(leadId);
    
    if (isLeadInDevMode) {
      console.log(`🛠️ DEV MODE: Skipping all escalation checks for lead ${leadId}`);
      return {
        shouldPause: false,
        reason: null,
        followUpMessage: null
      };
    }
    
    // Get escalation keywords (custom or default)
    const escalationKeywords = promptService.getEscalationKeywords();
    const expertQuestions = promptService.getExpertQuestions();
    
    // Check for keyword matches
    const hasEscalationKeyword = escalationKeywords.some(keyword => message.includes(keyword));
    
    // Check for specific questions that need human response
    const needsHumanExpertise = message.includes('?') && 
      expertQuestions.some(topic => message.includes(topic));
    
    // Check qualification status - this replaces the 3-message rule
    const qualificationComplete = qualificationStatus.shouldNotifyAgent;
    
    if (qualificationComplete) {
      console.log(`🎯 Qualification complete! Reasons: ${qualificationStatus.reasons.join(', ')}`);
    }
    
    // Log what triggered escalation for debugging
    if (hasEscalationKeyword || needsHumanExpertise || qualificationComplete) {
      console.log('Escalation triggered:');
      if (hasEscalationKeyword) console.log('  - Escalation keyword detected');
      if (needsHumanExpertise) console.log('  - Expert question detected');
      if (qualificationComplete) console.log('  - Lead qualification complete');
    }
    
    // Generate follow-up message if qualification is complete
    let followUpMessage = null;
    if (qualificationComplete && !hasEscalationKeyword && !needsHumanExpertise) {
      // Only generate follow-up for qualification completion, not other escalations
      followUpMessage = qualificationService.generateQualificationFollowUp(leadDetails, qualificationStatus);
    }
    
    return {
      shouldPause: hasEscalationKeyword || needsHumanExpertise || qualificationComplete,
      reason: qualificationComplete ? 'qualification_complete' : 
              hasEscalationKeyword ? 'escalation_keyword' : 
              needsHumanExpertise ? 'expert_question' : null,
      followUpMessage: followUpMessage
    };
  }
}

module.exports = ClaudeService;