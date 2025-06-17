// services/conversationService.js
// Critical service for maintaining full conversation context

class ConversationService {
  constructor(fubService) {
    this.fubService = fubService;
  }

  // Fetch ALL historical messages for a lead from FUB with pagination
  async fetchFullConversationHistory(leadId, leadName = null) {
    try {
      const allMessages = [];
      let offset = 0;
      const limit = 100; // FUB's max per page
      let hasMore = true;
      
      console.log(`📥 Fetching FUB messages for lead ${leadId}...`);
      
      // Keep fetching until we have all messages
      while (hasMore) {
        const url = `https://api.followupboss.com/v1/textMessages?personId=${leadId}&limit=${limit}&offset=${offset}&sort=-created`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: this.fubService.getHeaders()
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch conversation history (${response.status}):`, errorText);
          break;
        }

        const data = await response.json();
        const messages = data.textmessages || [];
        
        allMessages.push(...messages);
        
        // Check if there are more messages
        hasMore = messages.length === limit;
        offset += limit;
        
        console.log(`   Fetched batch: ${messages.length} messages (total so far: ${allMessages.length})`);
      }
      
      console.log(`   Total messages fetched: ${allMessages.length}`);
      
      // Transform FUB messages to our format
      // Determine sender based on phone numbers
      const eugeniaPhoneNumber = process.env.TWILIO_FROM_NUMBER;
      
      // Helper function to normalize phone numbers for comparison
      const normalizePhone = (phone) => {
        if (!phone) return '';
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        // If it's 11 digits starting with 1, remove the 1
        if (digits.length === 11 && digits.startsWith('1')) {
          return digits.substring(1);
        }
        return digits;
      };
      
      const normalizedEugeniaPhone = normalizePhone(eugeniaPhoneNumber);
      console.log(`   Normalized Eugenia phone for comparison: ${normalizedEugeniaPhone}`);
      
      const messages = allMessages.map(msg => {
        // Normalize the fromNumber for comparison
        const normalizedFromNumber = normalizePhone(msg.fromNumber);
        
        // Message is from lead if fromNumber is NOT Eugenia's number
        const isFromLead = normalizedFromNumber !== normalizedEugeniaPhone;
        
        return {
          sender: isFromLead ? (leadName || msg.firstName || 'Lead') : 'Eugenia',
          text: msg.message || msg.body || '',
          timestamp: msg.created || msg.createdDate || msg.sentDate,
          fubMessageId: msg.id,
          direction: isFromLead ? 'inbound' : 'outbound',
          fromNumber: msg.fromNumber,
          toNumber: msg.toNumber,
          userId: msg.userId
        };
      });

      // Sort by timestamp (oldest first)
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      console.log(`Fetched ${messages.length} historical messages for lead ${leadId}`);
      return messages;
    } catch (error) {
      console.error('Error fetching conversation history:', error);
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
        notes: leadData.background,
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
  
  // Alias method for webhook compatibility
  async getConversationHistory(leadId, leadName = null) {
    return this.fetchFullConversationHistory(leadId, leadName);
  }
  
  // Format conversation history for AI prompt
  formatConversationForAI(messages) {
    if (!messages || messages.length === 0) {
      return "No previous conversation history.";
    }
    
    // Take the most recent messages (AI doesn't need ancient history)
    const recentMessages = messages.slice(-50); // Last 50 messages
    
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