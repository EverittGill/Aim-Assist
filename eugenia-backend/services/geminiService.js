const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateInitialOutreach(leadDetails, agencyName) {
    const prompt = `You are Eugenia, a friendly real estate assistant for ${agencyName}. Generate a natural, personalized initial SMS message to a new lead.

Lead Details:
- Name: ${leadDetails.name || 'there'}
- Source: ${leadDetails.source || 'Unknown'}
- Notes: ${leadDetails.notes || 'No additional notes'}

Keep the message:
- Under 160 characters
- Friendly and professional
- Asking an engaging question
- Natural, not robotic
- Without using emojis

Example: "Hi [Name]! This is Eugenia with [Agency]. I noticed you were looking at homes. Are you planning to buy or just browsing for now?"`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generating initial outreach:', error);
      throw new Error('Failed to generate AI message');
    }
  }

  async generateConversationReply(leadDetails, conversationHistory, agencyName, fullLeadContext = null) {
    const conversationText = conversationHistory.map(msg => 
      `${msg.sender === 'Eugenia' ? 'Eugenia' : msg.sender === 'ai' ? 'Eugenia' : leadDetails.name}: ${msg.text}`
    ).join('\n');

    // Build comprehensive lead profile
    const leadProfile = fullLeadContext ? `
- Name: ${fullLeadContext.name}
- Phone: ${fullLeadContext.phone}
- Email: ${fullLeadContext.email}
- Source: ${fullLeadContext.source || 'Unknown'}
- Stage: ${fullLeadContext.stage || 'Lead'}
- Tags: ${fullLeadContext.tags?.join(', ') || 'None'}
- Notes: ${fullLeadContext.notes || 'No notes'}
- Property Interest: ${fullLeadContext.propertyInterests || 'Not specified'}
- Price Range: ${fullLeadContext.priceRange || 'Not specified'}
- Timeline: ${fullLeadContext.timeline || 'Not specified'}
- First Contact: ${fullLeadContext.created ? new Date(fullLeadContext.created).toLocaleDateString() : 'Unknown'}
- Total Messages Exchanged: ${conversationHistory.length}` : `
- Name: ${leadDetails.name || 'there'}
- Source: ${leadDetails.source || 'Unknown'}
- Notes: ${leadDetails.notes || 'No additional notes'}`;

    const prompt = `You are Eugenia, a friendly real estate assistant for ${agencyName}. Continue this SMS conversation naturally.

CRITICAL CONTEXT RETENTION RULES:
1. You MUST remember EVERYTHING discussed in previous messages
2. NEVER ask questions that have already been answered
3. Reference previous conversations when relevant
4. Build upon what you already know about this lead
5. If they mentioned preferences, properties, or timeline before, remember and use that info

Lead Profile:${leadProfile}

COMPLETE Conversation History (${conversationHistory.length} messages):
${conversationText}

Generate a natural reply that:
- Continues from where the conversation left off
- NEVER repeats questions already answered
- References previous information when relevant
- Is under 160 characters for SMS
- Sounds human and conversational
- Moves the conversation forward based on their stage
- Without using emojis

If the lead mentions any of these, flag for auto-pause:
- Wants to schedule a call
- Asks to stop/unsubscribe
- Says they're not interested
- Already working with another agent`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      // Check for auto-pause conditions
      const autoPauseKeywords = [
        'schedule a call',
        'call me',
        'stop',
        'unsubscribe',
        'not interested',
        'another agent',
        'already working with'
      ];
      
      const shouldAutoPause = autoPauseKeywords.some(keyword => 
        text.toLowerCase().includes(keyword) || 
        conversationHistory[conversationHistory.length - 1]?.text?.toLowerCase().includes(keyword)
      );

      return {
        message: text,
        shouldAutoPause
      };
    } catch (error) {
      console.error('Error generating conversation reply:', error);
      throw new Error('Failed to generate AI reply');
    }
  }
}

module.exports = GeminiService;