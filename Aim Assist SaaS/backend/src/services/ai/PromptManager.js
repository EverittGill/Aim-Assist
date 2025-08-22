/**
 * Prompt Manager for Multi-Tenant AI System
 * Handles tenant-specific prompt customization with fallback to defaults
 * Supports variable substitution and template management
 */

const { supabase } = require('../../config/supabase');

class PromptManager {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.prompts = new Map();
    this.variables = new Map();
    this.defaultPrompts = this.getDefaultPrompts();
  }

  /**
   * Load tenant-specific prompts from database
   */
  async loadTenantPrompts() {
    try {
      const { data: customPrompts, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('is_active', true);

      if (error) {
        console.error('Error loading tenant prompts:', error);
        return;
      }

      // Store custom prompts
      customPrompts?.forEach(prompt => {
        this.prompts.set(prompt.prompt_key, {
          template: prompt.template,
          variables: prompt.variables || [],
          maxLength: prompt.max_length || 160,
          category: prompt.category
        });
      });

      console.log(`📝 Loaded ${customPrompts?.length || 0} custom prompts for tenant ${this.tenantId}`);
    } catch (error) {
      console.error('Failed to load tenant prompts:', error);
    }
  }

  /**
   * Get a prompt by key with fallback to defaults
   */
  async getPrompt(key, variables = {}) {
    // Ensure prompts are loaded
    if (this.prompts.size === 0) {
      await this.loadTenantPrompts();
    }

    // Get custom or default prompt
    const prompt = this.prompts.get(key) || this.defaultPrompts.get(key);
    
    if (!prompt) {
      console.warn(`⚠️ No prompt found for key: ${key}`);
      return this.getFailsafePrompt(key);
    }

    // Substitute variables
    return this.substituteVariables(prompt.template, variables);
  }

  /**
   * Substitute variables in a prompt template
   */
  substituteVariables(template, variables) {
    let result = template;

    // Replace all {{variable}} patterns
    Object.entries(variables).forEach(([key, value]) => {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      result = result.replace(pattern, value || '');
    });

    // Remove any remaining unsubstituted variables
    result = result.replace(/{{[^}]+}}/g, '');

    return result.trim();
  }

  /**
   * Get default prompts
   */
  getDefaultPrompts() {
    const prompts = new Map();

    // Initial outreach
    prompts.set('initial_outreach', {
      template: `You are a friendly real estate assistant for {{agencyName}}.

Generate a warm, natural initial SMS to {{leadName}} who expressed interest through {{leadSource}}.

Requirements:
- Keep under 160 characters
- Be conversational, not robotic
- Ask about their timeline to buy/sell
- NO emojis
- Reference their source naturally

Generate only the message text.`,
      variables: ['agencyName', 'leadName', 'leadSource'],
      maxLength: 160,
      category: 'outreach'
    });

    // Conversation reply
    prompts.set('conversation_reply', {
      template: `You are a helpful real estate assistant for {{agencyName}}.

Lead: {{leadName}}
Recent conversation:
{{conversationHistory}}

Their message: "{{currentMessage}}"

Generate a natural response that:
- Stays under 160 characters
- {{primaryGoal}}
- Doesn't repeat answered questions
- NO emojis

Message only:`,
      variables: ['agencyName', 'leadName', 'conversationHistory', 'currentMessage', 'primaryGoal'],
      maxLength: 160,
      category: 'conversation'
    });

    // Follow-up message
    prompts.set('follow_up', {
      template: `You are following up with {{leadName}} for {{agencyName}}.

It's been {{daysSince}} days since last contact.
Their interest: {{leadInterest}}

Generate a friendly follow-up SMS that:
- Re-engages naturally
- Under 160 characters
- References their interest
- NO emojis

Message:`,
      variables: ['leadName', 'agencyName', 'daysSince', 'leadInterest'],
      maxLength: 160,
      category: 'follow_up'
    });

    // Qualification complete
    prompts.set('qualification_complete', {
      template: `Perfect {{leadName}}! {{agentName}} will {{nextStep}}. They'll reach out within {{timeframe}}. Looking forward to helping you!`,
      variables: ['leadName', 'agentName', 'nextStep', 'timeframe'],
      maxLength: 160,
      category: 'handoff'
    });

    // Schedule request
    prompts.set('schedule_acknowledge', {
      template: `Great {{leadName}}! I'll have {{agentName}} call you to schedule that {{appointmentType}}. They'll reach out {{timeframe}}.`,
      variables: ['leadName', 'agentName', 'appointmentType', 'timeframe'],
      maxLength: 160,
      category: 'scheduling'
    });

    // Human handoff
    prompts.set('human_handoff', {
      template: `I understand {{leadName}}. Let me connect you with {{agentName}} who can help with that. They'll reach out shortly.`,
      variables: ['leadName', 'agentName'],
      maxLength: 160,
      category: 'handoff'
    });

    return prompts;
  }

  /**
   * Get failsafe prompt when nothing else matches
   */
  getFailsafePrompt(key) {
    const failsafePrompts = {
      initial_outreach: "Hi! I saw you were interested in real estate. What type of property are you looking for?",
      conversation_reply: "Thanks for your message! Let me help you with that.",
      follow_up: "Hi! Just checking in. Still interested in finding your perfect home?",
      qualification_complete: "Perfect! An agent will reach out to you shortly.",
      schedule_acknowledge: "Great! I'll have someone call you to schedule that.",
      human_handoff: "I'll connect you with an agent who can help with that."
    };

    return failsafePrompts[key] || "Thanks for your message. How can I help you today?";
  }

  /**
   * Build qualification-aware prompt
   */
  buildQualificationPrompt(qualificationStatus) {
    let primaryGoal = "Continue the conversation naturally";

    if (!qualificationStatus.hasTimeline) {
      primaryGoal = "Find out their timeline to move/buy";
    } else if (!qualificationStatus.hasAgentStatus) {
      primaryGoal = "Ask if they're working with another agent";
    } else if (!qualificationStatus.hasFinancing) {
      primaryGoal = "Ask about financing (pre-approved or cash)";
    } else if (qualificationStatus.hasPhoneInterest) {
      primaryGoal = "Acknowledge their interest in a phone call";
    } else if (qualificationStatus.hasSchedulingInterest) {
      primaryGoal = "Acknowledge their scheduling request";
    }

    return primaryGoal;
  }

  /**
   * Get escalation keywords (customizable per tenant)
   */
  async getEscalationKeywords() {
    const { data } = await supabase
      .from('tenant_settings')
      .select('escalation_keywords')
      .eq('tenant_id', this.tenantId)
      .single();

    return data?.escalation_keywords || [
      'speak to someone',
      'talk to an agent',
      'call me',
      'human',
      'real person',
      'stop',
      'unsubscribe',
      'opt out',
      'remove me',
      'lawsuit',
      'attorney',
      'lawyer',
      'complaint'
    ];
  }

  /**
   * Save a custom prompt for the tenant
   */
  async saveCustomPrompt(key, template, variables = [], category = 'custom') {
    try {
      const { data, error } = await supabase
        .from('ai_prompts')
        .upsert({
          tenant_id: this.tenantId,
          prompt_key: key,
          template: template,
          variables: variables,
          category: category,
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id,prompt_key'
        })
        .select()
        .single();

      if (error) throw error;

      // Update cache
      this.prompts.set(key, {
        template,
        variables,
        maxLength: 160,
        category
      });

      console.log(`✅ Saved custom prompt: ${key}`);
      return data;
    } catch (error) {
      console.error('Error saving custom prompt:', error);
      throw error;
    }
  }

  /**
   * Get all prompts for UI display
   */
  async getAllPrompts() {
    await this.loadTenantPrompts();

    const allPrompts = [];

    // Add custom prompts
    for (const [key, prompt] of this.prompts) {
      allPrompts.push({
        key,
        ...prompt,
        isCustom: true
      });
    }

    // Add default prompts (if not overridden)
    for (const [key, prompt] of this.defaultPrompts) {
      if (!this.prompts.has(key)) {
        allPrompts.push({
          key,
          ...prompt,
          isCustom: false
        });
      }
    }

    return allPrompts;
  }

  /**
   * Reset a prompt to default
   */
  async resetToDefault(key) {
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .update({ is_active: false })
        .eq('tenant_id', this.tenantId)
        .eq('prompt_key', key);

      if (error) throw error;

      // Remove from cache
      this.prompts.delete(key);

      console.log(`🔄 Reset prompt to default: ${key}`);
      return true;
    } catch (error) {
      console.error('Error resetting prompt:', error);
      return false;
    }
  }
}

module.exports = PromptManager;