/**
 * Development Mode Service
 * Manages per-lead development mode settings for testing
 */

class DevModeService {
  constructor() {
    // In-memory storage for dev mode settings (in production, use Redis or DB)
    this.devModeLeads = new Set();
    
    // Always enable dev mode for lead 470 in development environment
    if (process.env.NODE_ENV !== 'production') {
      this.devModeLeads.add('470');
      console.log('🛠️ Dev mode auto-enabled for Test Lead 470');
    }
  }

  /**
   * Enable or disable dev mode for a specific lead
   */
  setDevMode(leadId, enabled) {
    if (enabled) {
      this.devModeLeads.add(leadId);
      console.log(`🛠️ Dev mode ENABLED for lead ${leadId}`);
    } else {
      this.devModeLeads.delete(leadId);
      console.log(`🛠️ Dev mode DISABLED for lead ${leadId}`);
    }
    
    return {
      leadId,
      devModeEnabled: enabled,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if a lead has dev mode enabled
   */
  isDevModeEnabled(leadId) {
    const enabled = this.devModeLeads.has(leadId);
    if (enabled) {
      console.log(`🛠️ Lead ${leadId} is in DEV MODE - all limits disabled`);
    }
    return enabled;
  }

  /**
   * Get all leads with dev mode enabled
   */
  getDevModeLeads() {
    return Array.from(this.devModeLeads);
  }

  /**
   * Clear all dev mode settings
   */
  clearAll() {
    this.devModeLeads.clear();
    console.log('🛠️ All dev mode settings cleared');
  }
}

module.exports = new DevModeService();