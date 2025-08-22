/**
 * Google Gemini AI Provider
 * Handles text generation using Gemini API
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider {
  constructor(config = {}) {
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 100;
    this.model = config.model || 'gemini-pro';
    
    // Initialize Gemini if API key is available
    this.apiKey = process.env.GEMINI_API_KEY;
    this.client = null;
    
    if (this.apiKey && this.apiKey !== 'your_gemini_key') {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
  }

  getName() {
    return 'gemini';
  }

  async isConfigured() {
    return !!(this.apiKey && this.apiKey !== 'your_gemini_key');
  }

  async testConnection() {
    if (!this.client) return false;
    
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const result = await model.generateContent('Hello');
      return !!result.response;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  async generate(systemPrompt, userPrompt) {
    if (!this.client) {
      console.log('Gemini not configured, using mock response');
      return this.getMockResponse(userPrompt);
    }
    
    try {
      const model = this.client.getGenerativeModel({ 
        model: this.model,
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          topK: 1,
          topP: 1,
        }
      });
      
      // Combine prompts for Gemini
      const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
      
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();
      
      return text.trim();
    } catch (error) {
      console.error('Gemini generation error:', error);
      return this.getMockResponse(userPrompt);
    }
  }

  getMockResponse(prompt) {
    const responses = [
      "Hi! I'd love to help you find the perfect home. What are you looking for?",
      "Great question! Let me help you with that.",
      "Thanks for reaching out! I'm here to assist with your real estate needs.",
      "I can definitely help with that! Tell me more about what you need.",
      "Absolutely! Let's find you the perfect property."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  get supportsStreaming() {
    return true;
  }

  get supportsFunctionCalling() {
    return false;
  }

  get costPer1kTokens() {
    return 0; // Gemini is free for now
  }
}

module.exports = GeminiProvider;