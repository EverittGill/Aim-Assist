/**
 * Orchestrates AI providers (Claude, Gemini, GPT-4)
 * Selects provider based on tenant settings
 * Handles prompt building with variable substitution
 * Enforces SMS length limits (160 chars)
 */

const ClaudeProvider = require('./providers/ClaudeProvider');
const GeminiProvider = require('./providers/GeminiProvider');
const OpenAIProvider = require('./providers/OpenAIProvider');
const PromptEngine = require('./PromptEngine');
const TenantService = require('../TenantService');

class AIService {
  constructor(tenantId = null) {
    this.tenantId = tenantId;
    this.providers = {
      claude: ClaudeProvider,
      gemini: GeminiProvider,
      openai: OpenAIProvider,
      gpt4: OpenAIProvider // Alias for OpenAI
    };
    this.promptEngine = new PromptEngine(tenantId);
    this.settings = null;
  }

  /**
   * Initialize AI service with tenant settings
   */
  async initialize() {
    if (this.tenantId) {
      const tenant = await TenantService.getById(this.tenantId);
      this.settings = tenant?.settings || {};
    } else {
      // Default settings for testing
      this.settings = {
        ai_provider: process.env.DEFAULT_AI_PROVIDER || 'gemini',
        ai_temperature: 0.7,
        ai_max_tokens: 100
      };
    }
  }

  /**
   * Get the configured AI provider
   */
  async getProvider() {
    if (!this.settings) {
      await this.initialize();
    }
    
    const providerName = this.settings.ai_provider || 'gemini';
    const ProviderClass = this.providers[providerName];
    
    if (!ProviderClass) {
      throw new Error(`Unknown AI provider: ${providerName}`);
    }
    
    return new ProviderClass({
      temperature: this.settings.ai_temperature || 0.7,
      maxTokens: this.settings.ai_max_tokens || 100
    });
  }

  /**
   * Generate initial outreach message
   */
  async generateInitialOutreach(context) {
    try {
      const { lead, templateId } = context;
      
      // Get prompt template
      const promptTemplate = await this.promptEngine.getPrompt(templateId || 'initial_outreach');
      
      // Build context
      const promptContext = {
        leadName: lead.first_name || 'there',
        leadSource: lead.source || 'website',
        agencyName: this.settings.agency_name || 'our team',
        currentTime: new Date().toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })
      };
      
      // Substitute variables
      const prompt = this.promptEngine.substituteVariables(promptTemplate, promptContext);
      
      // Add SMS constraints
      const systemPrompt = `You are a friendly real estate assistant. Generate a short, natural SMS message (MAX 160 characters) for initial outreach to a new lead. Be warm and conversational.`;
      
      // Get provider and generate
      const provider = await this.getProvider();
      const response = await provider.generate(systemPrompt, prompt);
      
      // Ensure SMS length limit
      const message = this.enforceSMSLimit(response);
      
      return {
        content: message,
        provider: provider.getName(),
        templateId
      };
    } catch (error) {
      console.error('Error generating initial outreach:', error);
      // Fallback message
      return {
        content: "Hi! I'm here to help with your real estate needs. What are you looking for?",
        provider: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Generate conversation reply
   */
  async generateReply(context) {
    try {
      const { 
        lead, 
        conversationHistory, 
        currentMessage,
        templateId 
      } = context;
      
      // Get prompt template
      const promptTemplate = await this.promptEngine.getPrompt(templateId || 'conversation_reply');
      
      // Build context
      const promptContext = {
        leadName: lead.first_name || 'there',
        agencyName: this.settings.agency_name || 'our team',
        conversationHistory: this.formatHistory(conversationHistory),
        currentMessage,
        messageCount: conversationHistory.length
      };
      
      // Substitute variables
      const prompt = this.promptEngine.substituteVariables(promptTemplate, promptContext);
      
      // System prompt with constraints
      const systemPrompt = `You are a helpful real estate assistant continuing a conversation. 
      Rules:
      1. Keep responses under 160 characters
      2. Be natural and conversational
      3. Focus on the lead's question
      4. Don't repeat information already shared
      5. If they want to schedule or talk to someone, acknowledge it positively`;
      
      // Get provider and generate
      const provider = await this.getProvider();
      const response = await provider.generate(systemPrompt, prompt);
      
      // Check for escalation
      const shouldEscalate = this.checkForEscalation(currentMessage);
      
      // Ensure SMS length limit
      const message = this.enforceSMSLimit(response);
      
      return {
        content: message,
        provider: provider.getName(),
        shouldEscalate,
        templateId
      };
    } catch (error) {
      console.error('Error generating reply:', error);
      // Fallback message
      return {
        content: "Thanks for your message! Let me help you with that.",
        provider: 'fallback',
        shouldEscalate: false,
        error: error.message
      };
    }
  }

  /**
   * Generate follow-up message
   */
  async generateFollowUp(context) {
    try {
      const { lead, daysSinceLastContact, templateId } = context;
      
      // Get prompt template
      const promptTemplate = await this.promptEngine.getPrompt(templateId || 'follow_up');
      
      // Build context
      const promptContext = {
        leadName: lead.first_name || 'there',
        agencyName: this.settings.agency_name || 'our team',
        daysSince: daysSinceLastContact,
        leadSource: lead.source
      };
      
      // Substitute variables
      const prompt = this.promptEngine.substituteVariables(promptTemplate, promptContext);
      
      // System prompt
      const systemPrompt = `Generate a friendly follow-up SMS (MAX 160 chars) to re-engage a lead who hasn't responded in ${daysSinceLastContact} days. Be casual and helpful.`;
      
      // Get provider and generate
      const provider = await this.getProvider();
      const response = await provider.generate(systemPrompt, prompt);
      
      // Ensure SMS length limit
      const message = this.enforceSMSLimit(response);
      
      return {
        content: message,
        provider: provider.getName(),
        templateId
      };
    } catch (error) {
      console.error('Error generating follow-up:', error);
      return {
        content: "Hi! Just checking in. Still interested in finding your dream home?",
        provider: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Format conversation history for AI
   */
  formatHistory(messages) {
    if (!messages || messages.length === 0) {
      return 'No previous messages';
    }
    
    // Take last 10 messages for context
    const recent = messages.slice(-10);
    
    return recent.map(msg => {
      const sender = msg.sender_type === 'lead' ? 'Lead' : 'Assistant';
      return `${sender}: ${msg.content}`;
    }).join('\n');
  }

  /**
   * Check if message requires escalation
   */
  checkForEscalation(message) {
    const escalationPhrases = [
      'speak to someone',
      'talk to a person',
      'human',
      'real agent',
      'call me',
      'phone number',
      'schedule',
      'appointment',
      'showing',
      'tour',
      'visit',
      'meet',
      'financing',
      'mortgage',
      'pre-approval',
      'contract',
      'offer',
      'stop',
      'unsubscribe'
    ];
    
    const lowerMessage = message.toLowerCase();
    return escalationPhrases.some(phrase => lowerMessage.includes(phrase));
  }

  /**
   * Enforce SMS character limit
   */
  enforceSMSLimit(message) {
    if (!message) return '';
    
    // Clean up the message
    let cleaned = message.trim();
    
    // Remove any quotes if AI wrapped response in them
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // Truncate if over 160 characters
    if (cleaned.length > 160) {
      // Try to cut at a sentence boundary
      const truncated = cleaned.substring(0, 157);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastQuestion = truncated.lastIndexOf('?');
      const lastExclamation = truncated.lastIndexOf('!');
      
      const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclamation);
      
      if (lastSentence > 100) {
        cleaned = truncated.substring(0, lastSentence + 1);
      } else {
        cleaned = truncated + '...';
      }
    }
    
    return cleaned;
  }

  /**
   * Test all configured providers
   */
  async testProviders() {
    const results = {};
    
    for (const [name, ProviderClass] of Object.entries(this.providers)) {
      if (name === 'gpt4') continue; // Skip alias
      
      try {
        const provider = new ProviderClass();
        const isConfigured = await provider.isConfigured();
        const canConnect = isConfigured ? await provider.testConnection() : false;
        
        results[name] = {
          configured: isConfigured,
          connected: canConnect,
          status: canConnect ? 'ready' : (isConfigured ? 'error' : 'not_configured')
        };
      } catch (error) {
        results[name] = {
          configured: false,
          connected: false,
          status: 'error',
          error: error.message
        };
      }
    }
    
    return results;
  }

  /**
   * Get provider capabilities
   */
  async getCapabilities() {
    const provider = await this.getProvider();
    return {
      provider: provider.getName(),
      maxTokens: this.settings.ai_max_tokens || 100,
      temperature: this.settings.ai_temperature || 0.7,
      supportsStreaming: provider.supportsStreaming || false,
      supportsFunctionCalling: provider.supportsFunctionCalling || false,
      costPer1kTokens: provider.costPer1kTokens || 0
    };
  }
}

module.exports = AIService;