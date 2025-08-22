/**
 * Anthropic Claude AI Provider
 * Handles text generation using Claude API
 */

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeProvider {
  constructor(config = {}) {
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 100;
    this.model = config.model || 'claude-3-opus-20240229';
    
    // Initialize Claude if API key is available
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = null;
    
    if (this.apiKey && this.apiKey !== 'sk-ant-your_anthropic_key') {
      this.client = new Anthropic({
        apiKey: this.apiKey
      });
    }
  }

  getName() {
    return 'claude';
  }

  async isConfigured() {
    return !!(this.apiKey && this.apiKey !== 'sk-ant-your_anthropic_key');
  }

  async testConnection() {
    if (!this.client) return false;
    
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      });
      return !!message.content;
    } catch (error) {
      console.error('Claude connection test failed:', error);
      return false;
    }
  }

  async generate(systemPrompt, userPrompt) {
    if (!this.client) {
      console.log('Claude not configured, using mock response');
      return this.getMockResponse(userPrompt);
    }
    
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      });
      
      // Extract text from Claude's response format
      const text = message.content[0].text;
      return text.trim();
    } catch (error) {
      console.error('Claude generation error:', error);
      return this.getMockResponse(userPrompt);
    }
  }

  getMockResponse(prompt) {
    const responses = [
      "Hello! I'm here to help you find your dream home. What type of property interests you?",
      "I'd be happy to assist! What specific features are you looking for?",
      "Great to hear from you! Let's discuss your real estate needs.",
      "Thanks for reaching out! How can I help with your property search?",
      "I'm here to help! Tell me about your ideal home."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  get supportsStreaming() {
    return true;
  }

  get supportsFunctionCalling() {
    return true;
  }

  get costPer1kTokens() {
    return 0.015; // Claude 3 Opus pricing
  }
}

module.exports = ClaudeProvider;