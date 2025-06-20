const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ISA_PROMPTS, ESCALATION_KEYWORDS, EXPERT_QUESTIONS } = require('../prompts/isaPrompts');
const promptService = require('./promptService');

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
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
    // Format conversation history
    const formattedHistory = this.formatConversationHistory(conversationHistory, leadDetails.name);

    // Count messages to check 3-message limit
    const leadMessageCount = conversationHistory.filter(m => m.direction === 'inbound').length + 1; // +1 for current message

    const prompt = this.buildISAPrompt({
      agencyName,
      leadDetails,
      conversationHistory: formattedHistory,
      currentMessage,
      messageCount: leadMessageCount,
      totalMessages: conversationHistory.length
    });

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      // Check for escalation conditions
      const shouldPause = this.checkEscalationTriggers(text, currentMessage, leadMessageCount);

      return {
        message: text,
        shouldPause
      };
    } catch (error) {
      console.error('Error generating conversation reply:', error);
      throw new Error('Failed to generate AI reply');
    }
  }
  
  // Keep the old method name for compatibility
  async generateConversationReply(leadDetails, conversationHistory, agencyName, fullLeadContext = null) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    return this.generateReply(leadDetails, conversationHistory, lastMessage?.text || '', agencyName);
  }
  
  formatConversationHistory(messages, leadName) {
    if (!messages || messages.length === 0) {
      return "No previous messages.";
    }
    
    // Take recent messages for context (last 30 messages)
    const recentMessages = messages.slice(-30);
    
    return recentMessages.map(msg => {
      const sender = msg.sender === 'Eugenia' ? 'Eugenia' : leadName;
      return `${sender}: ${msg.text}`;
    }).join('\n');
  }
  
  buildISAPrompt({ agencyName, leadDetails, conversationHistory, currentMessage, messageCount, totalMessages }) {
    // Get the prompt function (custom or default)
    const promptFunc = promptService.getExecutablePrompt('conversationReply');
    return promptFunc({ 
      agencyName, 
      leadDetails, 
      conversationHistory, 
      currentMessage, 
      messageCount, 
      totalMessages 
    });
  }
  
  checkEscalationTriggers(aiResponse, leadMessage, messageCount) {
    const message = (aiResponse + ' ' + leadMessage).toLowerCase();
    
    // Get escalation keywords (custom or default)
    const escalationKeywords = promptService.getEscalationKeywords();
    const expertQuestions = promptService.getExpertQuestions();
    
    // Check for keyword matches
    const hasEscalationKeyword = escalationKeywords.some(keyword => message.includes(keyword));
    
    // Check for specific questions that need human response
    const needsHumanExpertise = message.includes('?') && 
      expertQuestions.some(topic => message.includes(topic));
    
    // 3-message rule
    const exceededMessageLimit = messageCount >= 3;
    
    // Log what triggered escalation for debugging
    if (hasEscalationKeyword || needsHumanExpertise || exceededMessageLimit) {
      console.log('Escalation triggered:');
      if (hasEscalationKeyword) console.log('  - Escalation keyword detected');
      if (needsHumanExpertise) console.log('  - Expert question detected');
      if (exceededMessageLimit) console.log('  - 3-message limit reached');
    }
    
    return hasEscalationKeyword || needsHumanExpertise || exceededMessageLimit;
  }
}

module.exports = GeminiService;