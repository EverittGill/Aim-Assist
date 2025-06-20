/**
 * Message Storage Service
 * Handles storing and retrieving conversation messages in FUB notes field
 */

const storageConfig = require('../config/storageConfig');

class MessageStorageService {
  constructor() {
    // Load configuration
    const config = storageConfig.getConfig();
    this.MAX_MESSAGES = parseInt(process.env.STORAGE_MAX_MESSAGES || config.targetMessages || 200);
    this.MAX_NOTE_SIZE = config.maxNoteSize || 60000;
    this.STORAGE_VERSION = '1.0';
    
    console.log(`Message Storage initialized with limit: ${this.MAX_MESSAGES} messages`);
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
   * Parse messages from FUB notes field
   * @param {string} notesField - The notes field content from FUB
   * @returns {Object} Parsed message storage or empty structure
   */
  parseMessagesFromNotes(notesField) {
    if (!notesField || notesField.trim() === '') {
      return this.createEmptyStorage();
    }

    try {
      // Look for our JSON structure in the notes
      const jsonMatch = notesField.match(/\[EUGENIA_MESSAGES_START\](.*?)\[EUGENIA_MESSAGES_END\]/s);
      
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        
        // Validate structure
        if (parsed.conversations && Array.isArray(parsed.conversations)) {
          return parsed;
        }
      }
      
      // If no valid structure found, check if entire field is JSON
      const parsed = JSON.parse(notesField);
      if (parsed.conversations && Array.isArray(parsed.conversations)) {
        return parsed;
      }
    } catch (error) {
      console.error('Error parsing messages from notes:', error);
    }

    // Return empty structure if parsing fails
    return this.createEmptyStorage();
  }

  /**
   * Add a new message to the storage
   * @param {Object} storage - Current message storage
   * @param {Object} message - Message to add
   * @returns {Object} Updated storage
   */
  addMessage(storage, message) {
    const newMessage = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      direction: message.direction, // 'inbound' or 'outbound'
      type: message.type || 'sms', // 'sms' or 'ai'
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      twilioSid: message.twilioSid,
      fubLogged: message.fubLogged || false
    };

    // Add to conversations array
    storage.conversations.push(newMessage);

    // Maintain size limit
    if (storage.conversations.length > this.MAX_MESSAGES) {
      storage.conversations = storage.conversations.slice(-this.MAX_MESSAGES);
    }

    // Update metadata
    storage.metadata.lastUpdated = new Date().toISOString();
    storage.metadata.messageCount = storage.conversations.length;

    return storage;
  }

  /**
   * Format storage for saving to FUB notes
   * @param {Object} storage - Message storage object
   * @param {string} existingNotes - Existing notes content to preserve
   * @returns {string} Formatted notes field content
   */
  formatForNotes(storage, existingNotes = '') {
    const jsonString = JSON.stringify(storage, null, 2);
    
    // Check size
    if (jsonString.length > this.MAX_NOTE_SIZE) {
      // Compress by removing old messages
      storage.conversations = storage.conversations.slice(-30);
      storage.metadata.compressed = true;
      storage.metadata.messageCount = storage.conversations.length;
    }

    const formattedJson = JSON.stringify(storage);

    // Preserve any existing non-message notes
    let preservedNotes = existingNotes
      .replace(/\[EUGENIA_MESSAGES_START\].*?\[EUGENIA_MESSAGES_END\]/s, '')
      .trim();

    // Combine with our message storage
    const combinedNotes = preservedNotes
      ? `${preservedNotes}\n\n[EUGENIA_MESSAGES_START]${formattedJson}[EUGENIA_MESSAGES_END]`
      : `[EUGENIA_MESSAGES_START]${formattedJson}[EUGENIA_MESSAGES_END]`;

    return combinedNotes;
  }

  /**
   * Get recent messages for AI context
   * @param {Object} storage - Message storage
   * @param {number} limit - Number of recent messages to return
   * @returns {Array} Recent messages
   */
  getRecentMessages(storage, limit = 20) {
    if (!storage.conversations || !Array.isArray(storage.conversations)) {
      return [];
    }

    return storage.conversations.slice(-limit);
  }

  /**
   * Format messages for AI context
   * @param {Array} messages - Array of messages
   * @returns {string} Formatted conversation string
   */
  formatForAI(messages) {
    return messages.map(msg => {
      const sender = msg.direction === 'inbound' ? 'Lead' : 'Agent';
      const time = new Date(msg.timestamp).toLocaleString();
      return `[${time}] ${sender}: ${msg.content}`;
    }).join('\n');
  }

  /**
   * Check if storage is approaching size limit
   * @param {Object} storage - Message storage
   * @returns {boolean} True if approaching limit
   */
  isApproachingLimit(storage) {
    const currentSize = JSON.stringify(storage).length;
    return currentSize > (this.MAX_NOTE_SIZE * 0.8); // 80% threshold
  }

  /**
   * Get storage statistics
   * @param {Object} storage - Message storage
   * @returns {Object} Storage stats
   */
  getStats(storage) {
    const jsonSize = JSON.stringify(storage).length;
    
    return {
      messageCount: storage.conversations?.length || 0,
      oldestMessage: storage.conversations?.[0]?.timestamp,
      newestMessage: storage.conversations?.[storage.conversations.length - 1]?.timestamp,
      storageUsed: jsonSize,
      storageLimit: this.MAX_NOTE_SIZE,
      percentUsed: Math.round((jsonSize / this.MAX_NOTE_SIZE) * 100),
      compressed: storage.metadata?.compressed || false
    };
  }
}

module.exports = new MessageStorageService();