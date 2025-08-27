/**
 * Claude AI Service for Multi-Tenant Aim Assist
 * Handles intelligent conversation with leads using Claude 3.5 Sonnet
 * Includes deduplication, state management, and smart context
 */

const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { supabase } = require('../../config/supabase');
const SimpleContextManager = require('../SimpleContextManager');

class ClaudeService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.contextManager = new SimpleContextManager(tenantId);
    
    if (!this.apiKey || this.apiKey === 'sk-ant-your_anthropic_key') {
      console.warn('⚠️ Claude API key not configured - using mock responses');
      this.client = null;
    } else {
      this.client = new Anthropic({ apiKey: this.apiKey });
      console.log('✅ Claude 3.5 Sonnet initialized for tenant:', tenantId);
    }
    
    // Message deduplication cache (in-memory for now)
    this.recentMessages = new Map(); // leadId -> array of recent message hashes
    this.conversationStates = new Map(); // leadId -> state
  }

  /**
   * Generate a response to a lead message
   */
  async generateResponse({
    leadId,
    leadName,
    currentMessage,
    conversationHistory = [],
    leadContext = {},
    agencyName = 'the team'
  }) {
    try {
      // Check conversation state
      const state = this.getConversationState(leadId);
      if (state === 'RESPONDING' || state === 'WAITING') {
        console.log(`⏸️ Lead ${leadId} in state ${state}, skipping response`);
        return null;
      }
      
      // Set state to processing
      this.setConversationState(leadId, 'PROCESSING');
      
      // Get full context using SimpleContextManager
      const fullContext = await this.contextManager.getFullContext(leadId, currentMessage);
      console.log(`📚 Context loaded: ${fullContext.messages.length} messages, facts:`, fullContext.facts);
      
      // Check if we need to escalate based on keywords
      if (this.needsEscalation(currentMessage)) {
        console.log('🎯 Escalation keyword detected');
        this.setConversationState(leadId, 'WAITING');
        
        const agentName = process.env.AGENT_NAME || 'Everitt';
        return {
          message: `Perfect! ${agentName} will reach out to you shortly to help with that. Looking forward to speaking with you!`,
          isQualified: true,
          shouldPause: true
        };
      }
      
      // Build the prompt with full context
      const prompt = this.buildSimplePrompt({
        leadName: leadName || fullContext.leadInfo?.first_name || 'there',
        currentMessage,
        context: fullContext.formatted,
        agencyName
      });
      
      // Generate response
      const response = await this.callClaude(prompt);
      
      // Check for duplicates
      if (this.isDuplicate(leadId, response)) {
        console.log('🚫 Duplicate message detected, regenerating...');
        this.setConversationState(leadId, 'IDLE');
        return await this.generateResponse(arguments[0]); // Retry once
      }
      
      // Store message hash for deduplication
      this.storeMessageHash(leadId, response);
      
      // Set state to waiting for response
      this.setConversationState(leadId, 'WAITING');
      
      return response;
    } catch (error) {
      console.error('Error generating Claude response:', error);
      this.setConversationState(leadId, 'IDLE');
      throw error;
    }
  }

  /**
   * Build smart context from conversation history
   */
  buildSmartContext(conversationHistory, leadContext) {
    // Get last 50 messages for much better context
    const recentMessages = conversationHistory.slice(-50);
    
    // Format messages
    const formattedMessages = recentMessages.map(msg => {
      const sender = msg.direction === 'inbound' ? 'Lead' : 'You';
      return `${sender}: ${msg.content}`;
    }).join('\n');
    
    // Extract key facts
    const keyFacts = [];
    if (leadContext.timeline) keyFacts.push(`Timeline: ${leadContext.timeline}`);
    if (leadContext.budget) keyFacts.push(`Budget: ${leadContext.budget}`);
    if (leadContext.location) keyFacts.push(`Location: ${leadContext.location}`);
    if (leadContext.propertyType) keyFacts.push(`Looking for: ${leadContext.propertyType}`);
    
    return {
      recentMessages: formattedMessages,
      keyFacts: keyFacts.join(', '),
      messageCount: conversationHistory.length
    };
  }

  /**
   * Build simple prompt without complex dependencies
   */
  buildSimplePrompt({ leadName, currentMessage, context, agencyName }) {
    const systemPrompt = `You are Eugenia, a friendly AI assistant for ${agencyName}.

CRITICAL RULES:
1. Keep responses under 160 characters (SMS limit)
2. NEVER repeat questions that have been answered
3. Be conversational and helpful
4. If information is already known, acknowledge it don't ask again

What you already know about this lead:
${context.knownFacts}`;

    const userPrompt = `Lead Name: ${leadName}
Previous conversation (${context.messageCount} messages):
${context.recentConversation}

Lead's current message: "${currentMessage}"

Generate a helpful response. If they've already told you their budget, timeline, or other info, don't ask for it again. Be natural and move the conversation forward.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build the prompt for Claude (DEPRECATED - kept for compatibility)
   */
  async buildPrompt({ leadName, currentMessage, context, agencyName, qualification }) {
    // Determine the primary goal based on qualification status
    let primaryGoal = 'Continue the conversation naturally';
    
    if (qualification && qualification.nextQuestion) {
      primaryGoal = `Ask: "${qualification.nextQuestion}"`;
    } else if (qualification && qualification.missingFields.length > 0) {
      const field = qualification.missingFields[0];
      primaryGoal = `Find out their ${field}`;
    }
    
    // Get the appropriate prompt template
    const promptTemplate = await this.promptManager.getPrompt('conversation_reply', {
      agencyName,
      leadName: leadName || 'there',
      conversationHistory: context.recentMessages || 'No prior messages',
      currentMessage,
      primaryGoal
    });
    
    // System prompt remains consistent
    const systemPrompt = `You are a friendly, professional real estate assistant named ${process.env.AI_NAME || 'Eugenia'} for ${agencyName}. 
Your goal is to have natural conversations and gather information when appropriate.

CRITICAL RULES:
1. Keep responses under 160 characters (SMS limit)
2. NEVER repeat questions that have been answered
3. If they say they want to go to bed/sleep or can't talk now, respect that immediately
4. Don't push for scheduling if they've already expressed interest
5. If they ask for a call at a specific time, confirm it and stop pushing
6. Be conversational, not salesy or pushy`;
    
    // Add key facts if available
    let userPrompt = promptTemplate;
    if (context.keyFacts) {
      userPrompt = `Key Facts: ${context.keyFacts}\n\n${userPrompt}`;
    }
    
    return { systemPrompt, userPrompt };
  }

  /**
   * Call Claude API
   */
  async callClaude({ systemPrompt, userPrompt }) {
    // Mock response for testing if no API key
    if (!this.client) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
      return "Thanks for your message! I'd love to help you find your perfect home. When are you looking to move?";
    }
    
    try {
      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100, // Keep responses short for SMS
        temperature: 0.7, // Natural but not too creative
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });
      
      const response = message.content[0].text.trim();
      
      // Ensure it's under 160 characters
      if (response.length > 160) {
        return response.substring(0, 157) + '...';
      }
      
      return response;
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Check if message is a duplicate
   */
  isDuplicate(leadId, message) {
    const hash = this.hashMessage(message);
    const recentHashes = this.recentMessages.get(leadId) || [];
    return recentHashes.includes(hash);
  }

  /**
   * Store message hash for deduplication
   */
  storeMessageHash(leadId, message) {
    const hash = this.hashMessage(message);
    let recentHashes = this.recentMessages.get(leadId) || [];
    
    // Keep only last 5 hashes
    recentHashes.push(hash);
    if (recentHashes.length > 5) {
      recentHashes = recentHashes.slice(-5);
    }
    
    this.recentMessages.set(leadId, recentHashes);
  }

  /**
   * Hash a message for deduplication
   */
  hashMessage(message) {
    // Normalize message (lowercase, remove extra spaces)
    const normalized = message.toLowerCase().replace(/\s+/g, ' ').trim();
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Get conversation state
   */
  getConversationState(leadId) {
    return this.conversationStates.get(leadId) || 'IDLE';
  }

  /**
   * Set conversation state
   */
  setConversationState(leadId, state) {
    this.conversationStates.set(leadId, state);
    console.log(`📊 Lead ${leadId} state: ${state}`);
    
    // Auto-reset to IDLE after timeout
    if (state === 'WAITING') {
      setTimeout(() => {
        if (this.getConversationState(leadId) === 'WAITING') {
          this.setConversationState(leadId, 'IDLE');
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  /**
   * Reset conversation state (called when new message arrives)
   */
  resetConversationState(leadId) {
    this.setConversationState(leadId, 'IDLE');
  }
  
  /**
   * Clear state for testing
   */
  clearState(leadId) {
    this.conversationStates.delete(leadId);
    this.recentMessages.delete(leadId);
  }

  /**
   * Check if we should respond (rate limiting, business hours, etc.)
   */
  shouldRespond(leadId, leadContext = {}) {
    // Check if AI is paused for this lead
    if (leadContext.aiPaused) {
      console.log(`⏸️ AI paused for lead ${leadId}`);
      return false;
    }
    
    // Check conversation state
    const state = this.getConversationState(leadId);
    if (state !== 'IDLE' && state !== 'RECEIVING') {
      console.log(`⏸️ Lead ${leadId} in state ${state}, not responding`);
      return false;
    }
    
    // Could add more checks here:
    // - Business hours
    // - Message rate limits
    // - Tenant-specific rules
    
    return true;
  }

  /**
   * Analyze message for escalation triggers
   */
  needsEscalation(message) {
    const escalationKeywords = [
      'speak to someone',
      'talk to an agent',
      'call me',
      'human',
      'real person',
      'stop',
      'unsubscribe',
      'lawyer',
      'attorney',
      'complaint'
    ];
    
    const lowerMessage = message.toLowerCase();
    return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
  }
}

module.exports = ClaudeService;