/**
 * OpenAI GPT Provider
 * Handles text generation using OpenAI API (GPT-3.5/GPT-4)
 */

const OpenAI = require('openai');

class OpenAIProvider {
  constructor(config = {}) {
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 100;
    this.model = config.model || 'gpt-3.5-turbo';
    
    // Initialize OpenAI if API key is available
    this.apiKey = process.env.OPENAI_API_KEY;
    this.client = null;
    
    if (this.apiKey && this.apiKey !== 'sk-your_openai_key') {
      this.client = new OpenAI({
        apiKey: this.apiKey
      });
    }
  }

  getName() {
    return this.model.includes('gpt-4') ? 'gpt4' : 'openai';
  }

  async isConfigured() {
    return !!(this.apiKey && this.apiKey !== 'sk-your_openai_key');
  }

  async testConnection() {
    if (!this.client) return false;
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      return !!completion.choices[0].message;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  async generate(systemPrompt, userPrompt) {
    if (!this.client) {
      console.log('OpenAI not configured, using mock response');
      return this.getMockResponse(userPrompt);
    }
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });
      
      const text = completion.choices[0].message.content;
      return text.trim();
    } catch (error) {
      console.error('OpenAI generation error:', error);
      return this.getMockResponse(userPrompt);
    }
  }

  getMockResponse(prompt) {
    const responses = [
      "Hi there! Ready to find your perfect home? What's most important to you?",
      "I'm here to help! What kind of property are you interested in?",
      "Thanks for your message! Let's discuss your real estate goals.",
      "Great to connect! How can I assist with your property search today?",
      "Hello! I'd love to help you. What brings you here today?"
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
    // Pricing varies by model
    if (this.model.includes('gpt-4')) {
      return 0.03; // GPT-4 pricing
    }
    return 0.002; // GPT-3.5 pricing
  }
}

module.exports = OpenAIProvider;