const Anthropic = require('@anthropic-ai/sdk');
const promptService = require('./promptService');
const qualificationService = require('./qualificationService');
const devModeService = require('./devModeService');

class ClaudeService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }
    console.log('🔑 Claude API key provided:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');
    
    this.client = new Anthropic({
      apiKey: apiKey
    });
    
    console.log('Claude 3.5 Sonnet configured successfully');
  }

  async generateInitialOutreach(leadDetails, agencyName) {
    const prompt = this.buildInitialOutreachPrompt(leadDetails, agencyName);
    
    try {
      console.log('🤖 Generating initial outreach with Claude...');
      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const response = message.content[0].text.trim();
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
    
    // Format conversation history - Claude can handle much more context!
    const formattedHistory = this.formatConversationHistory(conversationHistory, leadDetails.name);
    
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
      notesString: leadDetails.notes || leadDetails.background || 'No notes'
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
      console.log('🧠 Sending prompt to Claude...');
      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let response = message.content[0].text.trim();
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
  
  formatConversationHistory(messages, leadName) {
    if (!messages || messages.length === 0) {
      console.log('🔍 formatConversationHistory: No messages provided');
      return "No previous messages.";
    }
    
    console.log(`🔍 formatConversationHistory: Processing ${messages.length} messages for ${leadName}`);
    
    // Claude can handle MUCH more context - use all messages!
    const recentMessages = messages;
    
    const formatted = recentMessages.map(msg => {
      const messageContent = msg.text || msg.body || msg.content || '';
      
      let sender;
      if (msg.sender) {
        sender = msg.sender === 'Eugenia' ? 'Eugenia' : leadName;
      } else if (msg.direction) {
        sender = msg.direction === 'inbound' ? leadName : 'Eugenia';
      } else {
        sender = 'Unknown';
      }
      
      return `${sender}: ${messageContent}`;
    }).join('\n');
    
    console.log(`🔍 formatConversationHistory: Formatted history length: ${formatted.length} chars`);
    
    return formatted;
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
    
    // Otherwise use Claude-optimized prompt
    const leadName = leadDetails.firstName || leadDetails.name || 'there';
    const hasTimeline = qualificationStatus.hasTimeline;
    const hasAgentStatus = qualificationStatus.hasAgentStatus;
    const hasFinancing = qualificationStatus.hasFinancing;
    
    let focusPoint = '';
    if (!hasTimeline) {
      focusPoint = 'Find out their timeline to move.';
    } else if (!hasAgentStatus) {
      focusPoint = 'Ask if they are already working with another agent.';
    } else if (!hasFinancing) {
      focusPoint = 'Ask about their financing (pre-approved or cash).';
    }
    
    return `You are Eugenia, a friendly real estate assistant for ${agencyName}.

Lead: ${leadName}
Previous conversation:
${conversationHistory}

Their latest message: "${currentMessage}"

Generate a natural, conversational response. Requirements:
- Keep under 160 characters for SMS
- Be warm and personable, not robotic
- ${focusPoint || 'Continue the conversation naturally'}
- Do NOT use emojis
- Do NOT repeat questions they've already answered
- If they ask to speak with an agent or schedule something, acknowledge and say the agent will reach out

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