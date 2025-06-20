// services/conversationService.js
// Critical service for maintaining full conversation context

class ConversationService {
  constructor(fubService) {
    this.fubService = fubService;
  }

  // Fetch ALL historical messages for a lead from notes storage
  async fetchFullConversationHistory(leadId, leadName = null) {
    try {
      const messageStorageService = require('./messageStorageService');
      
      console.log(`📥 Fetching messages from notes storage for lead ${leadId}...`);
      
      // Get messages from FUB notes field
      const storage = await this.fubService.getLeadMessageStorage(leadId);
      const messages = storage.conversations || [];
      
      console.log(`   Total messages in storage: ${messages.length}`);
      
      // Transform stored messages to match expected format
      const transformedMessages = messages.map(msg => ({
        id: msg.id,
        created: msg.timestamp,
        body: msg.content,
        direction: msg.direction,
        type: msg.type,
        // Include sender info based on direction
        sender: msg.direction === 'inbound' ? leadName || 'Lead' : 'Eugenia'
      }));
      
      // Sort by timestamp (oldest first for chronological chat display)
      transformedMessages.sort((a, b) => new Date(a.created) - new Date(b.created));
      
      return transformedMessages;
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      // Return empty array as fallback
      return [];
    }
  }

  // Get comprehensive lead context for Gemini
  async getFullLeadContext(leadId) {
    try {
      // Fetch full lead details from FUB
      const url = `https://api.followupboss.com/v1/people/${leadId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.fubService.getHeaders()
      });

      if (!response.ok) {
        console.error('Failed to fetch lead details');
        return null;
      }

      const leadData = await response.json();
      
      // Extract all relevant information
      return {
        id: leadData.id,
        name: leadData.name,
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        email: leadData.emails?.[0]?.value,
        phone: leadData.phones?.[0]?.value,
        source: leadData.source,
        stage: leadData.stage,
        tags: leadData.tags,
        // Extract notes but remove our message storage
        notes: this.extractCleanNotes(leadData.background),
        customFields: leadData.customFields,
        created: leadData.created,
        lastContacted: leadData.lastCommunication?.createdDate,
        propertyInterests: leadData.customFields?.find(f => f.name === 'Property Interest')?.value,
        priceRange: leadData.customFields?.find(f => f.name === 'Price Range')?.value,
        timeline: leadData.customFields?.find(f => f.name === 'Timeline')?.value,
        // Add any other relevant fields
      };
    } catch (error) {
      console.error('Error fetching lead context:', error);
      return null;
    }
  }

  // Build complete context for Gemini including all history and lead data
  async buildCompleteContext(leadId, currentMessage = null) {
    const [conversationHistory, leadContext] = await Promise.all([
      this.fetchFullConversationHistory(leadId),
      this.getFullLeadContext(leadId)
    ]);

    return {
      leadContext,
      conversationHistory,
      currentMessage,
      totalMessageCount: conversationHistory.length,
      hasContext: conversationHistory.length > 0
    };
  }
  
  // Extract clean notes without our message storage JSON
  extractCleanNotes(notesField) {
    if (!notesField) return '';
    
    // Remove our message storage markers and content
    return notesField
      .replace(/\[EUGENIA_MESSAGES_START\].*?\[EUGENIA_MESSAGES_END\]/s, '')
      .trim();
  }

  // Alias method for webhook compatibility
  async getConversationHistory(leadId, leadName = null) {
    return this.fetchFullConversationHistory(leadId, leadName);
  }
  
  // Format conversation history for AI prompt
  formatConversationForAI(messages) {
    if (!messages || messages.length === 0) {
      return "No previous conversation history.";
    }
    
    // Send ALL messages - full context retention is our key feature!
    const recentMessages = messages;
    
    return recentMessages.map(msg => {
      const date = new Date(msg.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `[${date}] ${msg.sender}: ${msg.text}`;
    }).join('\n');
  }
  
  // Get conversation metrics for AI context
  getConversationMetrics(messages) {
    if (!messages || messages.length === 0) {
      return {
        totalMessages: 0,
        leadMessages: 0,
        eugeniaMessages: 0,
        lastContactDate: null,
        conversationDuration: 0
      };
    }
    
    const leadMessages = messages.filter(m => m.direction === 'inbound').length;
    const eugeniaMessages = messages.filter(m => m.direction === 'outbound').length;
    const firstMessage = new Date(messages[0].timestamp);
    const lastMessage = new Date(messages[messages.length - 1].timestamp);
    const durationDays = Math.floor((lastMessage - firstMessage) / (1000 * 60 * 60 * 24));
    
    return {
      totalMessages: messages.length,
      leadMessages,
      eugeniaMessages,
      lastContactDate: lastMessage.toISOString(),
      conversationDuration: durationDays
    };
  }
}

module.exports = ConversationService;