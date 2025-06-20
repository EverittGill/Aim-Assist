/**
 * Prompt Service
 * Manages AI prompts with persistence and dynamic updates
 */

const fs = require('fs').promises;
const path = require('path');

class PromptService {
  constructor() {
    this.promptsFile = path.join(__dirname, '../prompts/isaPrompts.js');
    this.customPromptsFile = path.join(__dirname, '../prompts/customPrompts.json');
    this.defaultPrompts = null;
    this.customPrompts = null;
    this.loadPrompts();
  }

  async loadPrompts() {
    try {
      // Load default prompts
      delete require.cache[require.resolve('../prompts/isaPrompts')];
      const { ISA_PROMPTS, ESCALATION_KEYWORDS, EXPERT_QUESTIONS } = require('../prompts/isaPrompts');
      this.defaultPrompts = { ISA_PROMPTS, ESCALATION_KEYWORDS, EXPERT_QUESTIONS };

      // Load custom prompts if they exist
      try {
        const customData = await fs.readFile(this.customPromptsFile, 'utf8');
        this.customPrompts = JSON.parse(customData);
        console.log('✅ Custom prompts loaded:', Object.keys(this.customPrompts));
      } catch (err) {
        // No custom prompts yet
        console.log('⚠️ No custom prompts found, using defaults');
        this.customPrompts = {};
      }

      console.log('Prompts loaded successfully');
    } catch (error) {
      console.error('Error loading prompts:', error);
    }
  }

  /**
   * Get all prompts (with custom overrides)
   */
  async getPrompts() {
    const prompts = {
      conversationReply: this.getPromptTemplate('conversationReply'),
      initialOutreach: this.getPromptTemplate('initialOutreach'),
      escalationKeywords: this.customPrompts?.escalationKeywords || this.defaultPrompts.ESCALATION_KEYWORDS,
      expertQuestions: this.customPrompts?.expertQuestions || this.defaultPrompts.EXPERT_QUESTIONS,
      lastUpdated: this.customPrompts?.lastUpdated || null
    };

    return prompts;
  }

  /**
   * Get a specific prompt template
   */
  getPromptTemplate(promptName) {
    // Check for custom prompt first
    if (this.customPrompts?.[promptName]) {
      return this.customPrompts[promptName];
    }

    // Return default prompt template (extract the template string from the function)
    const defaultFunc = this.defaultPrompts.ISA_PROMPTS[promptName];
    if (defaultFunc) {
      // Get the default template by calling the function with dummy params
      const dummyParams = {
        agencyName: '${agencyName}',
        leadDetails: {
          name: '${leadDetails.name || "Lead"}',
          source: '${leadDetails.source || "Website"}',
          tags: { join: () => '${leadDetails.tags?.join(", ") || "None"}' },
          status: '${leadDetails.status || "New Lead"}'
        },
        conversationHistory: '${conversationHistory}',
        currentMessage: '${currentMessage}',
        messageCount: '${messageCount}',
        totalMessages: '${totalMessages}'
      };
      
      return defaultFunc(dummyParams);
    }

    return null;
  }

  /**
   * Update a prompt
   */
  async updatePrompt(promptName, promptContent) {
    if (!this.customPrompts) {
      this.customPrompts = {};
    }

    this.customPrompts[promptName] = promptContent;
    this.customPrompts.lastUpdated = new Date().toISOString();

    // Save to file
    await fs.writeFile(
      this.customPromptsFile,
      JSON.stringify(this.customPrompts, null, 2),
      'utf8'
    );

    // Reload prompts to ensure they're in memory
    await this.loadPrompts();
    console.log('✅ Prompts reloaded after update');

    return { success: true, message: 'Prompt updated successfully' };
  }

  /**
   * Update escalation keywords
   */
  async updateEscalationKeywords(keywords) {
    if (!this.customPrompts) {
      this.customPrompts = {};
    }

    this.customPrompts.escalationKeywords = keywords;
    this.customPrompts.lastUpdated = new Date().toISOString();

    await fs.writeFile(
      this.customPromptsFile,
      JSON.stringify(this.customPrompts, null, 2),
      'utf8'
    );

    // Reload prompts to ensure they're in memory
    await this.loadPrompts();
    console.log('✅ Prompts reloaded after keywords update');

    return { success: true, message: 'Escalation keywords updated' };
  }

  /**
   * Reset to default prompts
   */
  async resetToDefaults() {
    this.customPrompts = {};
    
    try {
      await fs.unlink(this.customPromptsFile);
    } catch (err) {
      // File might not exist
    }

    await this.loadPrompts();
    return { success: true, message: 'Prompts reset to defaults' };
  }

  /**
   * Get the actual prompt function for execution
   */
  getExecutablePrompt(promptName) {
    console.log(`🔍 getExecutablePrompt called for: ${promptName}`);
    console.log(`🔍 Custom prompts available: ${this.customPrompts ? Object.keys(this.customPrompts) : 'none'}`);
    
    // If there's a custom prompt, create a function from it
    if (this.customPrompts?.[promptName]) {
      console.log(`✅ Using CUSTOM prompt for ${promptName}`);
      try {
        // Custom prompts are stored as template strings
        const template = this.customPrompts[promptName];
        console.log(`📝 Using custom prompt template for ${promptName}, length: ${template.length} chars`);
        
        // Create a function that returns the template with substitutions
        return (params) => {
          let result = template;
          let substitutionCount = 0;
          
          // Helper function to get nested property value
          const getNestedValue = (obj, path) => {
            const keys = path.split('.');
            let value = obj;
            
            for (const key of keys) {
              if (value && typeof value === 'object' && key in value) {
                value = value[key];
              } else {
                return undefined;
              }
            }
            
            return value;
          };
          
          // Replace template variables including nested properties and expressions
          result = result.replace(/\$\{([^}]+)\}/g, (match, expression) => {
            // Handle expressions with || for fallback values
            const parts = expression.split('||').map(part => part.trim());
            
            for (const part of parts) {
              // Check if it's a simple key or nested property
              const value = getNestedValue(params, part);
              
              if (value !== undefined && value !== null && value !== '') {
                substitutionCount++;
                console.log(`✅ Substituting ${match} with value of length ${typeof value === 'string' ? value.length : 'non-string'}`);
                return value;
              }
              
              // Check if it's a quoted string (fallback value)
              if (part.startsWith('"') && part.endsWith('"')) {
                substitutionCount++;
                return part.slice(1, -1);
              }
            }
            
            // If no value found, return the original placeholder
            console.warn(`⚠️ No value found for template variable: ${match}, params keys: ${Object.keys(params).join(', ')}`);
            return match;
          });
          
          console.log(`✅ Custom prompt ready: ${substitutionCount} variables substituted, final length: ${result.length} chars`);
          return result;
        };
      } catch (error) {
        console.error('Error creating custom prompt function:', error);
      }
    }

    console.log(`📝 Using default prompt function for ${promptName}`);
    // Return default prompt function
    return this.defaultPrompts.ISA_PROMPTS[promptName];
  }

  /**
   * Get escalation keywords (with custom overrides)
   */
  getEscalationKeywords() {
    return this.customPrompts?.escalationKeywords || this.defaultPrompts.ESCALATION_KEYWORDS;
  }

  /**
   * Get expert questions (with custom overrides)
   */
  getExpertQuestions() {
    return this.customPrompts?.expertQuestions || this.defaultPrompts.EXPERT_QUESTIONS;
  }
}

module.exports = new PromptService();