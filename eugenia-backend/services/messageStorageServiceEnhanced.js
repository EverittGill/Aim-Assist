/**
 * Enhanced Message Storage Service
 * Handles storing and retrieving conversation messages in FUB notes field
 * with dynamic sizing and compression
 */

class MessageStorageServiceEnhanced {
  constructor() {
    // Dynamic limits based on content
    this.MIN_MESSAGES = 50; // Minimum messages to keep
    this.MAX_MESSAGES = 500; // Maximum if space allows
    this.MAX_NOTE_SIZE = 60000; // Leave buffer for 64KB FUB limit
    this.COMPRESSION_THRESHOLD = 0.7; // Start compressing at 70% capacity
    this.STORAGE_VERSION = '2.0';
  }

  /**
   * Calculate optimal message limit based on average message size
   */
  calculateOptimalMessageLimit(storage) {
    if (!storage.conversations || storage.conversations.length === 0) {
      return this.MAX_MESSAGES;
    }

    // Calculate average message size
    const totalSize = JSON.stringify(storage.conversations).length;
    const avgMessageSize = totalSize / storage.conversations.length;
    
    // Calculate how many messages can fit
    const availableSpace = this.MAX_NOTE_SIZE * 0.9; // Use 90% of limit
    const optimalCount = Math.floor(availableSpace / avgMessageSize);
    
    // Return a value between MIN and MAX
    return Math.max(this.MIN_MESSAGES, Math.min(optimalCount, this.MAX_MESSAGES));
  }

  /**
   * Compress older messages to save space
   */
  compressOldMessages(messages) {
    if (messages.length <= this.MIN_MESSAGES) {
      return messages;
    }

    // Keep recent messages in full
    const recentCount = Math.floor(this.MIN_MESSAGES / 2);
    const recentMessages = messages.slice(-recentCount);
    const olderMessages = messages.slice(0, -recentCount);

    // Compress older messages by removing metadata
    const compressedOlder = olderMessages.map(msg => ({
      id: msg.id.substring(0, 10), // Shorten ID
      d: msg.direction === 'inbound' ? 'i' : 'o', // Compress direction
      c: msg.content.substring(0, 100), // Truncate long messages
      t: new Date(msg.timestamp).getTime() // Use timestamp number
    }));

    return [...compressedOlder, ...recentMessages];
  }

  /**
   * Add a new message with smart storage management
   */
  addMessage(storage, message) {
    const newMessage = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      direction: message.direction,
      type: message.type || 'sms',
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      twilioSid: message.twilioSid,
      fubLogged: message.fubLogged || false
    };

    // Add to conversations array
    storage.conversations.push(newMessage);

    // Calculate optimal limit based on current content
    const optimalLimit = this.calculateOptimalMessageLimit(storage);
    
    // Check if we need to compress or trim
    const currentSize = JSON.stringify(storage).length;
    const sizeRatio = currentSize / this.MAX_NOTE_SIZE;

    if (sizeRatio > this.COMPRESSION_THRESHOLD) {
      // Compress older messages first
      storage.conversations = this.compressOldMessages(storage.conversations);
      storage.metadata.compressed = true;
    }

    // If still over limit, trim to optimal count
    if (storage.conversations.length > optimalLimit) {
      storage.conversations = storage.conversations.slice(-optimalLimit);
    }

    // Update metadata
    storage.metadata.lastUpdated = new Date().toISOString();
    storage.metadata.messageCount = storage.conversations.length;
    storage.metadata.optimalLimit = optimalLimit;
    storage.metadata.compressionRatio = sizeRatio;

    return storage;
  }

  /**
   * Smart archiving - create summary of older conversations
   */
  createConversationSummary(messages) {
    const summary = {
      type: 'summary',
      messageCount: messages.length,
      dateRange: {
        start: messages[0]?.timestamp,
        end: messages[messages.length - 1]?.timestamp
      },
      topics: this.extractTopics(messages),
      keyPoints: this.extractKeyPoints(messages)
    };

    return summary;
  }

  /**
   * Extract topics from messages (simple implementation)
   */
  extractTopics(messages) {
    const topics = new Set();
    const keywords = ['property', 'house', 'condo', 'price', 'bedroom', 'location', 'budget', 'showing', 'tour'];
    
    messages.forEach(msg => {
      const content = msg.content?.toLowerCase() || '';
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          topics.add(keyword);
        }
      });
    });

    return Array.from(topics);
  }

  /**
   * Extract key points from conversation
   */
  extractKeyPoints(messages) {
    const keyPoints = [];
    
    messages.forEach(msg => {
      const content = msg.content || '';
      // Look for budget mentions
      const budgetMatch = content.match(/\$[\d,]+k?/i);
      if (budgetMatch) {
        keyPoints.push(`Budget: ${budgetMatch[0]}`);
      }
      
      // Look for bedroom/bathroom mentions
      const bedMatch = content.match(/(\d+)\s*(bed|br)/i);
      if (bedMatch) {
        keyPoints.push(`Bedrooms: ${bedMatch[1]}`);
      }
      
      // Look for area mentions
      if (content.match(/area|neighborhood|location/i)) {
        const areas = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
        if (areas) {
          keyPoints.push(`Areas: ${areas.join(', ')}`);
        }
      }
    });

    return [...new Set(keyPoints)]; // Remove duplicates
  }

  /**
   * Get storage statistics with enhanced info
   */
  getStats(storage) {
    const jsonString = JSON.stringify(storage);
    const jsonSize = jsonString.length;
    
    // Count full vs compressed messages
    let fullMessages = 0;
    let compressedMessages = 0;
    
    storage.conversations?.forEach(msg => {
      if (msg.content && msg.direction) {
        fullMessages++;
      } else if (msg.c && msg.d) {
        compressedMessages++;
      }
    });
    
    return {
      messageCount: storage.conversations?.length || 0,
      fullMessages,
      compressedMessages,
      oldestMessage: storage.conversations?.[0]?.timestamp || storage.conversations?.[0]?.t,
      newestMessage: storage.conversations?.[storage.conversations.length - 1]?.timestamp,
      storageUsed: jsonSize,
      storageLimit: this.MAX_NOTE_SIZE,
      percentUsed: Math.round((jsonSize / this.MAX_NOTE_SIZE) * 100),
      compressed: storage.metadata?.compressed || false,
      optimalLimit: storage.metadata?.optimalLimit || this.MIN_MESSAGES,
      canAddMore: jsonSize < (this.MAX_NOTE_SIZE * 0.9)
    };
  }

  /**
   * Migrate from old format to new format
   */
  migrateStorage(oldStorage) {
    if (oldStorage.metadata?.version === this.STORAGE_VERSION) {
      return oldStorage;
    }

    return {
      conversations: oldStorage.conversations || [],
      metadata: {
        ...oldStorage.metadata,
        version: this.STORAGE_VERSION,
        migrated: new Date().toISOString()
      }
    };
  }

  /**
   * Initialize empty message storage structure
   */
  createEmptyStorage() {
    return {
      conversations: [],
      metadata: {
        version: this.STORAGE_VERSION,
        lastUpdated: new Date().toISOString(),
        messageCount: 0,
        compressed: false
      }
    };
  }

  /**
   * Parse messages from notes field
   */
  parseMessagesFromNotes(notesField) {
    if (!notesField || notesField.trim() === '') {
      return this.createEmptyStorage();
    }

    try {
      const jsonMatch = notesField.match(/\[EUGENIA_MESSAGES_START\](.*?)\[EUGENIA_MESSAGES_END\]/s);
      
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        return this.migrateStorage(parsed);
      }
      
      const parsed = JSON.parse(notesField);
      if (parsed.conversations && Array.isArray(parsed.conversations)) {
        return this.migrateStorage(parsed);
      }
    } catch (error) {
      console.error('Error parsing messages from notes:', error);
    }

    return this.createEmptyStorage();
  }

  /**
   * Format storage for saving to FUB notes
   */
  formatForNotes(storage, existingNotes = '') {
    const jsonString = JSON.stringify(storage);
    
    // Preserve any existing non-message notes
    let preservedNotes = existingNotes
      .replace(/\[EUGENIA_MESSAGES_START\].*?\[EUGENIA_MESSAGES_END\]/s, '')
      .trim();

    // Combine with our message storage
    const combinedNotes = preservedNotes
      ? `${preservedNotes}\n\n[EUGENIA_MESSAGES_START]${jsonString}[EUGENIA_MESSAGES_END]`
      : `[EUGENIA_MESSAGES_START]${jsonString}[EUGENIA_MESSAGES_END]`;

    return combinedNotes;
  }

  /**
   * Get recent messages for AI context
   */
  getRecentMessages(storage, limit = 20) {
    if (!storage.conversations || !Array.isArray(storage.conversations)) {
      return [];
    }

    // Return most recent messages, expanding compressed ones
    return storage.conversations.slice(-limit).map(msg => {
      if (msg.content && msg.direction) {
        // Full message
        return msg;
      } else if (msg.c && msg.d) {
        // Compressed message - expand it
        return {
          id: msg.id,
          direction: msg.d === 'i' ? 'inbound' : 'outbound',
          content: msg.c,
          timestamp: new Date(msg.t).toISOString()
        };
      }
      return msg;
    });
  }

  /**
   * Format messages for AI context
   */
  formatForAI(messages) {
    return messages.map(msg => {
      const sender = msg.direction === 'inbound' ? 'Lead' : 'Agent';
      const time = new Date(msg.timestamp || msg.t).toLocaleString();
      return `[${time}] ${sender}: ${msg.content || msg.c}`;
    }).join('\n');
  }

  /**
   * Check if storage is approaching limit
   */
  isApproachingLimit(storage) {
    const currentSize = JSON.stringify(storage).length;
    return currentSize > (this.MAX_NOTE_SIZE * this.COMPRESSION_THRESHOLD);
  }
}

module.exports = new MessageStorageServiceEnhanced();