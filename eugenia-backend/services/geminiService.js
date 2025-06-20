const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ISA_PROMPTS, ESCALATION_KEYWORDS, EXPERT_QUESTIONS } = require('../prompts/isaPrompts');
const promptService = require('./promptService');
const qualificationService = require('./qualificationService');

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    console.log('🔑 Gemini API key provided:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');
    this.genAI = new GoogleGenerativeAI(apiKey);
    
    // Configure generation parameters for more control
    const generationConfig = {
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'), // 0.7 for natural conversation
      topK: parseInt(process.env.GEMINI_TOP_K || '40'),
      topP: parseFloat(process.env.GEMINI_TOP_P || '0.9'),
      maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '80'), // SMS-appropriate length (160 chars ≈ 40-80 tokens)
    };
    
    console.log('🔧 Gemini Configuration:', {
      temperature: generationConfig.temperature,
      topK: generationConfig.topK,
      topP: generationConfig.topP,
      maxOutputTokens: generationConfig.maxOutputTokens,
      envValue: process.env.GEMINI_MAX_TOKENS
    });
    
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',  // Updated to latest model
      generationConfig
    });
    
    console.log('Gemini configured with temperature:', generationConfig.temperature);
  }

  async generateInitialOutreach(leadDetails, agencyName) {
    // Get the prompt function (custom or default)
    const promptFunc = promptService.getExecutablePrompt('initialOutreach');
    const prompt = promptFunc({ agencyName, leadDetails });

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generating initial outreach:', error);
      throw new Error('Failed to generate AI message');
    }
  }

  async generateReply(leadDetails, conversationHistory, currentMessage, agencyName) {
    // Analyze qualification status instead of counting messages
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
    
    // Format conversation history
    const formattedHistory = this.formatConversationHistory(conversationHistory, leadDetails.name);
    
    console.log(`📊 Generating AI reply with context:
    - Lead: ${leadDetails.name} (ID: ${leadDetails.id})
    - First Name: ${leadDetails.firstName}
    - Conversation Messages: ${conversationHistory.length}
    - Qualification Complete: ${qualificationStatus.qualificationComplete}`);

    // Include all available lead information for better context
    // Only set defaults for critical system fields, not conversation content
    const enrichedLeadDetails = {
      ...leadDetails,
      // Only default the name to prevent system errors
      name: leadDetails.name || 'there',
      firstName: leadDetails.firstName || leadDetails.name?.split(' ')[0] || null,
      // Keep tags as empty array for system stability, but AI should never mention them
      tags: leadDetails.tags || [],
      // All other fields remain as-is (undefined if not provided)
      // This ensures Eugenia only references information that actually exists
    };

    const prompt = this.buildISAPrompt({
      agencyName,
      leadDetails: enrichedLeadDetails,
      conversationHistory: formattedHistory,
      currentMessage,
      messageCount: conversationHistory.filter(m => m.direction === 'inbound').length + 1,
      totalMessages: conversationHistory.length,
      qualificationStatus
    });
    
    console.log('📝 Prompt built, length:', prompt.length);
    console.log('📝 First 500 chars of prompt:', prompt.substring(0, 500));
    console.log('📝 Last 500 chars of prompt:', prompt.substring(prompt.length - 500));
    
    // Debug: Log the full prompt to see conversation history
    console.log('🔍 FULL PROMPT BEING SENT TO GEMINI:');
    console.log(prompt);
    console.log('🔍 END OF PROMPT');

    try {
      console.log('🧠 Sending prompt to Gemini...');
      console.log('🔧 Model config:', this.model.generationConfig);
      const result = await this.model.generateContent(prompt);
      console.log('📊 Raw result object:', {
        hasResponse: !!result.response,
        resultKeys: Object.keys(result)
      });
      
      const response = await result.response;
      console.log('📊 Response object:', {
        hasText: !!response.text,
        responseKeys: Object.keys(response),
        candidates: response.candidates?.length || 0
      });
      
      // Check candidates for safety blocks
      let finishReason = null;
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        finishReason = candidate.finishReason;
        console.log('🔍 Candidate details:', {
          finishReason: candidate.finishReason,
          hasSafetyRatings: !!candidate.safetyRatings,
          safetyRatings: candidate.safetyRatings,
          hasContent: !!candidate.content,
          contentParts: candidate.content?.parts?.length || 0
        });
      }
      
      let text = '';
      try {
        text = response.text().trim();
      } catch (textError) {
        console.error('❌ Error getting text from response:', textError.message);
        
        // Try to extract text from candidates directly
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            text = candidate.content.parts[0].text || '';
            console.log('✅ Extracted text from candidate parts:', text.substring(0, 100));
          }
        }
        
        // If still no text, check finish reason
        if (!text || text.length === 0) {
          if (finishReason === 'MAX_TOKENS') {
            console.error('⚠️ Response hit token limit! Using fallback response.');
            text = "Hi " + (leadDetails.firstName || 'there') + "! I'm Eugenia, Everitt's assistant. How can I help you with real estate today?";
          } else {
            console.log('📝 Full response object:', JSON.stringify(response, null, 2));
            text = "Thanks for your message! Let me help you with your real estate needs.";
          }
        }
      }
      
      // If we still have empty text, provide a fallback
      if (!text || text.length === 0) {
        console.error('⚠️ Empty response from Gemini, using fallback');
        text = "Thanks for reaching out! How can I help you with your real estate needs today?";
      }
      
      console.log('✅ Gemini response received:', {
        responseLength: text.length,
        firstChars: text.substring(0, 100)
      });
      
      // Check for escalation conditions and qualification status
      const escalationResult = this.checkEscalationTriggers(text, currentMessage, qualificationStatus, leadDetails);

      return {
        message: text,
        shouldPause: escalationResult.shouldPause,
        pauseReason: escalationResult.reason,
        isQualificationComplete: qualificationStatus.qualificationComplete,
        qualificationStatus: qualificationStatus,
        followUpMessage: escalationResult.followUpMessage
      };
    } catch (error) {
      console.error('Error generating conversation reply:', error);
      console.error('Error details:', error.message, error.stack);
      throw new Error('Failed to generate AI reply');
    }
  }
  
  // Keep the old method name for compatibility
  async generateConversationReply(leadDetails, conversationHistory, agencyName, fullLeadContext = null) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const lastMessageText = lastMessage?.text || lastMessage?.body || lastMessage?.content || '';
    
    // Use full lead context if available, otherwise use basic details
    const completeLeadDetails = fullLeadContext || leadDetails;
    
    return this.generateReply(completeLeadDetails, conversationHistory, lastMessageText, agencyName);
  }
  
  formatConversationHistory(messages, leadName) {
    if (!messages || messages.length === 0) {
      console.log('🔍 formatConversationHistory: No messages provided');
      return "No previous messages.";
    }
    
    console.log(`🔍 formatConversationHistory: Processing ${messages.length} messages for ${leadName}`);
    
    // Limit to last 20 messages to avoid token limits while maintaining context
    // We'll improve this with Claude which has a 200k token context window
    const recentMessages = messages.slice(-20);
    
    const formatted = recentMessages.map(msg => {
      // Handle different field names from different sources
      const messageContent = msg.text || msg.body || msg.content || '';
      
      // Determine sender based on available fields
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
    console.log(`🔍 formatConversationHistory: First 200 chars: ${formatted.substring(0, 200)}`);
    
    return formatted;
  }
  
  buildISAPrompt({ agencyName, leadDetails, conversationHistory, currentMessage, messageCount, totalMessages, qualificationStatus }) {
    console.log(`🔍 buildISAPrompt called with:
      - conversationHistory type: ${typeof conversationHistory}
      - conversationHistory length: ${conversationHistory ? conversationHistory.length : 'undefined'}
      - conversationHistory first 200 chars: ${conversationHistory ? conversationHistory.substring(0, 200) : 'undefined'}`);
    
    // Get the prompt function (custom or default)
    const promptFunc = promptService.getExecutablePrompt('conversationReply');
    const result = promptFunc({ 
      agencyName, 
      leadDetails, 
      conversationHistory, 
      currentMessage, 
      messageCount, 
      totalMessages,
      qualificationStatus 
    });
    
    console.log(`🔍 buildISAPrompt result includes conversationHistory: ${result.includes(conversationHistory)}`);
    
    return result;
  }
  
  checkEscalationTriggers(aiResponse, leadMessage, qualificationStatus, leadDetails) {
    const message = (aiResponse + ' ' + leadMessage).toLowerCase();
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const leadId = leadDetails.id;
    
    // Check if this specific lead has dev mode enabled
    const devModeService = require('./devModeService');
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

module.exports = GeminiService;