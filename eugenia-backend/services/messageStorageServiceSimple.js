/**
 * Simple Message Storage Service
 * Easy-to-configure version for storing more messages
 */

const storageConfig = require('../config/storageConfig');

class MessageStorageServiceSimple {
  constructor() {
    const config = storageConfig.getConfig();
    this.MESSAGE_LIMIT = config.targetMessages; // Easy to change
    this.MAX_NOTE_SIZE = config.maxNoteSize;
    this.STORAGE_VERSION = '1.1';
  }

  /**
   * Create empty storage
   */
  createEmptyStorage() {
    return {
      conversations: [],
      metadata: {
        version: this.STORAGE_VERSION,
        lastUpdated: new Date().toISOString(),
        messageCount: 0,
        messageLimit: this.MESSAGE_LIMIT
      }
    };
  }

  /**
   * Add a message (simplified version)
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

    // Add to conversations
    storage.conversations.push(newMessage);

    // Check size before trimming
    const currentSize = JSON.stringify(storage).length;
    
    // If we're over 90% of limit, reduce message count
    if (currentSize > this.MAX_NOTE_SIZE * 0.9) {
      // Keep 80% of current limit
      const reducedLimit = Math.floor(this.MESSAGE_LIMIT * 0.8);
      storage.conversations = storage.conversations.slice(-reducedLimit);
      console.log(`Storage near limit - reduced to ${reducedLimit} messages`);
    } else if (storage.conversations.length > this.MESSAGE_LIMIT) {
      // Normal trimming to message limit
      storage.conversations = storage.conversations.slice(-this.MESSAGE_LIMIT);
    }

    // Update metadata
    storage.metadata.lastUpdated = new Date().toISOString();
    storage.metadata.messageCount = storage.conversations.length;

    return storage;
  }

  /**
   * Parse messages from notes
   */
  parseMessagesFromNotes(notesField) {
    if (!notesField || notesField.trim() === '') {
      return this.createEmptyStorage();
    }

    try {
      const jsonMatch = notesField.match(/\[EUGENIA_MESSAGES_START\](.*?)\[EUGENIA_MESSAGES_END\]/s);
      
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.conversations && Array.isArray(parsed.conversations)) {
          return parsed;
        }
      }
      
      const parsed = JSON.parse(notesField);
      if (parsed.conversations && Array.isArray(parsed.conversations)) {
        return parsed;
      }
    } catch (error) {
      console.error('Error parsing messages from notes:', error);
    }

    return this.createEmptyStorage();
  }

  /**
   * Format for saving to FUB
   */
  formatForNotes(storage, existingNotes = '') {
    const jsonString = JSON.stringify(storage);
    
    // Preserve existing notes
    let preservedNotes = existingNotes
      .replace(/\[EUGENIA_MESSAGES_START\].*?\[EUGENIA_MESSAGES_END\]/s, '')
      .trim();

    const combinedNotes = preservedNotes
      ? `${preservedNotes}\n\n[EUGENIA_MESSAGES_START]${jsonString}[EUGENIA_MESSAGES_END]`
      : `[EUGENIA_MESSAGES_START]${jsonString}[EUGENIA_MESSAGES_END]`;

    return combinedNotes;
  }

  /**
   * Get recent messages for AI
   */
  getRecentMessages(storage, limit = 20) {
    if (!storage.conversations || !Array.isArray(storage.conversations)) {
      return [];
    }
    return storage.conversations.slice(-limit);
  }

  /**
   * Format messages for AI
   */
  formatForAI(messages) {
    return messages.map(msg => {
      const sender = msg.direction === 'inbound' ? 'Lead' : 'Agent';
      const time = new Date(msg.timestamp).toLocaleString();
      return `[${time}] ${sender}: ${msg.content}`;
    }).join('\n');
  }

  /**
   * Get storage stats
   */
  getStats(storage) {
    const jsonSize = JSON.stringify(storage).length;
    
    return {
      messageCount: storage.conversations?.length || 0,
      messageLimit: this.MESSAGE_LIMIT,
      oldestMessage: storage.conversations?.[0]?.timestamp,
      newestMessage: storage.conversations?.[storage.conversations.length - 1]?.timestamp,
      storageUsed: jsonSize,
      storageLimit: this.MAX_NOTE_SIZE,
      percentUsed: Math.round((jsonSize / this.MAX_NOTE_SIZE) * 100),
      canStore: Math.floor(this.MESSAGE_LIMIT * (1 - jsonSize / this.MAX_NOTE_SIZE))
    };
  }

  /**
   * Check if approaching limit
   */
  isApproachingLimit(storage) {
    const currentSize = JSON.stringify(storage).length;
    return currentSize > (this.MAX_NOTE_SIZE * 0.8);
  }
}

module.exports = new MessageStorageServiceSimple();