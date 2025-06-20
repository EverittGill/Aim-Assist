/**
 * Storage Configuration
 * Adjust these settings to control message storage behavior
 */

module.exports = {
  // Message limits
  MIN_MESSAGES: 50,          // Minimum messages to keep (always kept in full)
  MAX_MESSAGES: 500,         // Maximum messages if space allows
  TARGET_MESSAGES: 200,      // Target number of messages to keep
  
  // Storage limits
  MAX_NOTE_SIZE: 60000,      // FUB field limit (keep under 64KB)
  COMPRESSION_THRESHOLD: 0.7, // Start compressing at 70% capacity
  
  // Compression settings
  COMPRESS_AFTER_DAYS: 7,    // Compress messages older than this
  COMPRESSED_MESSAGE_LENGTH: 100, // Truncate compressed messages to this length
  
  // Feature flags
  ENABLE_COMPRESSION: true,   // Enable/disable compression
  ENABLE_SUMMARIES: false,    // Enable conversation summaries (future feature)
  
  // Get configuration
  getConfig() {
    return {
      minMessages: process.env.STORAGE_MIN_MESSAGES || this.MIN_MESSAGES,
      maxMessages: process.env.STORAGE_MAX_MESSAGES || this.MAX_MESSAGES,
      targetMessages: process.env.STORAGE_TARGET_MESSAGES || this.TARGET_MESSAGES,
      maxNoteSize: this.MAX_NOTE_SIZE,
      compressionThreshold: this.COMPRESSION_THRESHOLD,
      enableCompression: this.ENABLE_COMPRESSION
    };
  }
};