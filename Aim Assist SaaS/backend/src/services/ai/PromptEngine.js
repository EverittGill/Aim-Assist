/**
 * Manages prompt templates per tenant
 * Handles variable substitution (name, agency, etc.)
 * Loads industry-specific defaults
 * Allows tenant customization
 */

const { supabase } = require('../../config/supabase');

class PromptEngine {
  constructor(organizationId = null) {
    this.organizationId = organizationId;
    this.defaultPrompts = this.getDefaultPrompts();
    this.customPrompts = {};
  }

  /**
   * Get default prompt templates
   */
  getDefaultPrompts() {
    return {
      initial_outreach: `Hi {{leadName}}! I saw you're interested in real estate from {{leadSource}}. I'm with {{agencyName}} and would love to help. What are you looking for?`,
      
      conversation_reply: `{{conversationHistory}}
Lead: {{currentMessage}}
Assistant: [Generate a helpful, natural response under 160 characters addressing their question]`,
      
      follow_up: `Hi {{leadName}}! Just checking in from {{agencyName}}. Still interested in finding your perfect home?`,
      
      qualification_timeline: `{{leadName}}, when are you hoping to move? Just so I can prioritize the best properties for you!`,
      
      qualification_agent: `Are you already working with another agent, {{leadName}}? Want to make sure I'm not stepping on any toes!`,
      
      qualification_financing: `{{leadName}}, are you pre-approved or planning to pay cash? This helps me show you homes in your range!`,
      
      escalation_acknowledgment: `Perfect {{leadName}}! I'll have someone from our team call you shortly to discuss this in detail.`,
      
      auto_text_website: `Hi! I saw you checking out properties on our website. I'm {{agencyName}}'s assistant. Need help finding something specific?`,
      
      auto_text_zillow: `Hi {{leadName}}! Saw you're looking on Zillow. I can get you info not shown online. What caught your eye?`,
      
      business_hours_response: `Thanks for reaching out! Our team will get back to you first thing in the morning. Have a great evening!`,
      
      opt_out_confirmation: `You've been removed from our automated messages. Reply START anytime if you'd like to reconnect.`
    };
  }

  /**
   * Get prompt template
   */
  async getPrompt(templateName) {
    // Check for custom prompt first
    if (this.customPrompts[templateName]) {
      return this.customPrompts[templateName];
    }
    
    // Try to load from database if tenant ID provided
    if (this.organizationId && supabase) {
      try {
        const { data, error } = await supabase
          .from('templates')
          .select('content')
          .eq('organization_id', this.organizationId)
          .eq('name', templateName)
          .eq('is_active', true)
          .single();
        
        if (data) {
          this.customPrompts[templateName] = data.content;
          return data.content;
        }
      } catch (error) {
        console.log('No custom template found, using default');
      }
    }
    
    // Return default prompt
    return this.defaultPrompts[templateName] || this.defaultPrompts.conversation_reply;
  }

  /**
   * Save custom prompt template
   */
  async savePrompt(templateName, content, type = 'custom') {
    if (!this.organizationId || !supabase) {
      // Just save in memory
      this.customPrompts[templateName] = content;
      return true;
    }
    
    try {
      const { data, error } = await supabase
        .from('templates')
        .upsert({
          organization_id: this.organizationId,
          name: templateName,
          type,
          content,
          variables: this.extractVariables(content),
          is_active: true
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Cache the custom prompt
      this.customPrompts[templateName] = content;
      
      return true;
    } catch (error) {
      console.error('Error saving prompt:', error);
      return false;
    }
  }

  /**
   * Substitute variables in prompt
   */
  substituteVariables(template, variables) {
    let result = template;
    
    // Replace all {{variableName}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(pattern, value || '');
      
      // Also replace ${variableName} for backward compatibility
      const oldPattern = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(oldPattern, value || '');
    }
    
    // Clean up any remaining unsubstituted variables
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    result = result.replace(/\$\{[^}]+\}/g, '');
    
    return result.trim();
  }

  /**
   * Extract variable names from template
   */
  extractVariables(template) {
    const variables = [];
    
    // Match {{variableName}} patterns
    const matches = template.match(/\{\{([^}]+)\}\}/g) || [];
    
    for (const match of matches) {
      const varName = match.replace(/\{\{|\}\}/g, '');
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }
    
    // Also match $variableName patterns
    const simpleMatches = template.match(/\$(\w+)/g) || [];
    
    for (const match of simpleMatches) {
      const varName = match.replace('$', '');
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }
    
    return variables;
  }

  /**
   * Get all available templates
   */
  async getAllTemplates() {
    const templates = [];
    
    // Add default templates
    for (const [name, content] of Object.entries(this.defaultPrompts)) {
      templates.push({
        name,
        type: 'default',
        content,
        variables: this.extractVariables(content),
        is_active: true
      });
    }
    
    // Add custom templates from database
    if (this.organizationId && supabase) {
      try {
        const { data, error } = await supabase
          .from('templates')
          .select('*')
          .eq('organization_id', this.organizationId)
          .eq('is_active', true);
        
        if (data) {
          templates.push(...data.map(t => ({ ...t, type: 'custom' })));
        }
      } catch (error) {
        console.log('Error loading custom templates:', error);
      }
    }
    
    // Add in-memory custom prompts
    for (const [name, content] of Object.entries(this.customPrompts)) {
      if (!templates.find(t => t.name === name)) {
        templates.push({
          name,
          type: 'custom',
          content,
          variables: this.extractVariables(content),
          is_active: true
        });
      }
    }
    
    return templates;
  }

  /**
   * Reset to default prompts
   */
  async resetToDefaults() {
    this.customPrompts = {};
    
    if (this.organizationId && supabase) {
      try {
        await supabase
          .from('templates')
          .update({ is_active: false })
          .eq('organization_id', this.organizationId);
      } catch (error) {
        console.error('Error resetting templates:', error);
      }
    }
    
    return true;
  }

  /**
   * Get industry-specific prompts
   */
  getIndustryPrompts(industry) {
    const industryPrompts = {
      real_estate: this.getDefaultPrompts(),
      
      automotive: {
        initial_outreach: `Hi ${leadName}! I saw you're interested in a ${leadSource}. What kind of vehicle are you looking for?`,
        conversation_reply: `${conversationHistory}\nCustomer: ${currentMessage}\nAssistant: [Generate helpful response about vehicles]`
      },
      
      insurance: {
        initial_outreach: `Hi ${leadName}! Thanks for your interest in ${leadSource}. I can help you find the right coverage. What type of insurance do you need?`,
        conversation_reply: `${conversationHistory}\nClient: ${currentMessage}\nAssistant: [Generate helpful insurance response]`
      }
    };
    
    return industryPrompts[industry] || industryPrompts.real_estate;
  }

  /**
   * Validate prompt template
   */
  validatePrompt(template) {
    const errors = [];
    
    // Check length
    if (template.length > 1000) {
      errors.push('Template is too long (max 1000 characters)');
    }
    
    // Check for required variables in certain templates
    if (template.includes('${') && !template.includes('}')) {
      errors.push('Unclosed variable bracket');
    }
    
    // Check for balanced brackets
    const openBrackets = (template.match(/\{/g) || []).length;
    const closeBrackets = (template.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push('Unbalanced brackets in template');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = PromptEngine;