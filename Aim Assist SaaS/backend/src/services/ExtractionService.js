/**
 * Intelligent Data Extraction Service
 * Extracts structured data from conversations using Claude AI with Zod validation
 * Includes regex fallback patterns and confidence scoring
 */

const Anthropic = require('@anthropic-ai/sdk');
const { 
  LeadExtractionSchema, 
  ExtractionContextSchema,
  validateExtraction,
  validatePartialExtraction,
  calculateOverallConfidence
} = require('../schemas/extraction.schemas');

class ExtractionService {
  constructor(tenantId, config = {}) {
    this.tenantId = tenantId;
    this.anthropic = new Anthropic({
      apiKey: config.claudeApiKey || process.env.CLAUDE_API_KEY
    });
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.autoUpdateThreshold = config.autoUpdateThreshold || 0.85;
    this.maxRetries = config.maxRetries || 2;
  }

  /**
   * Extract structured data from a conversation
   */
  async extractFromConversation(context) {
    try {
      // Validate context
      const validatedContext = ExtractionContextSchema.parse(context);
      
      console.log(`🔍 Extracting data for lead ${validatedContext.leadId}`);
      
      // Try Claude extraction first
      let extraction = await this.extractWithClaude(validatedContext);
      
      // If Claude fails or has low confidence, try regex patterns
      if (!extraction || extraction.overallConfidence < this.confidenceThreshold) {
        console.log('📝 Claude extraction insufficient, trying regex patterns...');
        const regexExtraction = await this.extractWithRegex(validatedContext);
        
        // Merge extractions, preferring higher confidence values
        extraction = this.mergeExtractions(extraction, regexExtraction);
      }
      
      // Validate final extraction
      const validation = validatePartialExtraction(extraction);
      if (!validation.success) {
        console.warn('⚠️ Extraction validation failed:', validation.errors);
        extraction = this.sanitizeExtraction(extraction);
      }
      
      // Calculate final confidence
      extraction.overallConfidence = calculateOverallConfidence(extraction);
      extraction.extractionMethod = extraction.overallConfidence >= this.confidenceThreshold 
        ? 'hybrid' 
        : 'regex';
      extraction.extractionTimestamp = new Date();
      
      return {
        success: true,
        extraction,
        shouldAutoUpdate: extraction.overallConfidence >= this.autoUpdateThreshold,
        warnings: validation.errors || []
      };
      
    } catch (error) {
      console.error('❌ Extraction failed:', error);
      return {
        success: false,
        errors: [error.message],
        extraction: null
      };
    }
  }

  /**
   * Extract using Claude AI with structured prompting
   */
  async extractWithClaude(context) {
    const { conversation, currentMessage, leadProfile } = context;
    
    // Format conversation for Claude
    const conversationText = conversation
      .slice(-20) // Last 20 messages for context
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');
    
    const prompt = `
You are an expert at extracting structured data from real estate conversations.
Extract the following information from this conversation:

Lead Profile:
- Name: ${leadProfile?.name || 'Unknown'}
- Source: ${leadProfile?.source || 'Unknown'}
- Tags: ${leadProfile?.tags?.join(', ') || 'None'}

Conversation:
${conversationText}

Current message: "${currentMessage}"

Extract and return ONLY a JSON object with these fields (leave null if not found):
{
  "timeline": {
    "value": "timeline to move as stated by lead (e.g., 'next month', '3-6 months')",
    "confidence": 0.0-1.0
  },
  "budget": {
    "value": numeric budget amount,
    "min": minimum if range given,
    "max": maximum if range given,
    "confidence": 0.0-1.0
  },
  "agentStatus": {
    "hasAgent": true/false,
    "confidence": 0.0-1.0
  },
  "financing": {
    "status": "pre-approved" | "cash" | "needs-financing" | "unknown",
    "amount": numeric pre-approval amount if mentioned,
    "confidence": 0.0-1.0
  },
  "escalation": {
    "shouldPause": true/false,
    "reason": "human-requested" | "scheduling-requested" | "opt-out" | "qualified" | "high-value" | "complex-question" | "other",
    "confidence": 0.0-1.0
  },
  "location": {
    "value": "specific area or neighborhood mentioned",
    "confidence": 0.0-1.0
  },
  "propertyType": {
    "value": "house" | "condo" | "townhouse" | "land" | "multi-family" | "commercial" | "other",
    "confidence": 0.0-1.0
  },
  "motivation": {
    "value": "high" | "medium" | "low",
    "confidence": 0.0-1.0
  }
}

IMPORTANT:
- Set confidence based on how clearly the information was stated
- Use null for missing fields, not empty strings
- For timeline, preserve the exact phrasing used by the lead
- For escalation, check for keywords like "call me", "speak to someone", "stop", "unsubscribe"
- Return ONLY valid JSON, no additional text`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Parse Claude's response
      const responseText = response.content[0].text;
      const extraction = JSON.parse(responseText);
      
      console.log('✅ Claude extraction successful');
      return extraction;
      
    } catch (error) {
      console.error('❌ Claude extraction error:', error);
      
      // Retry with simpler prompt if needed
      if (this.maxRetries > 0) {
        this.maxRetries--;
        return this.extractWithClaudeSimple(context);
      }
      
      return null;
    }
  }

  /**
   * Simpler Claude extraction for retry attempts
   */
  async extractWithClaudeSimple(context) {
    const { conversation, currentMessage } = context;
    
    const recentMessages = conversation
      .slice(-10)
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');
    
    const prompt = `
Extract key information from this real estate conversation.

Recent messages:
${recentMessages}

Current: "${currentMessage}"

Reply with JSON only:
{
  "timeline": {"value": "when they want to move", "confidence": 0-1},
  "budget": {"value": dollar amount or null, "confidence": 0-1},
  "agentStatus": {"hasAgent": true/false, "confidence": 0-1},
  "financing": {"status": "pre-approved/cash/needs-financing/unknown", "confidence": 0-1},
  "escalation": {"shouldPause": true/false, "reason": "why", "confidence": 0-1}
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('❌ Simple Claude extraction also failed:', error);
      return null;
    }
  }

  /**
   * Extract using regex patterns as fallback
   */
  async extractWithRegex(context) {
    const { conversation, currentMessage } = context;
    
    // Combine recent messages for pattern matching
    const allText = conversation
      .slice(-10)
      .map(msg => msg.content)
      .concat([currentMessage])
      .join(' ')
      .toLowerCase();
    
    const extraction = {};
    
    // Timeline patterns
    const timelinePatterns = [
      /(?:move|moving|ready|looking)\s+(?:in|within)?\s*(\d+[\s-]?(?:days?|weeks?|months?))/i,
      /(?:asap|immediately|right away|urgent)/i,
      /(?:next|this)\s+(week|month|year)/i,
      /(?:by|before)\s+(\w+\s+\d+)/i
    ];
    
    for (const pattern of timelinePatterns) {
      const match = allText.match(pattern);
      if (match) {
        extraction.timeline = {
          value: match[1] || match[0],
          confidence: 0.7,
          context: 'Extracted via regex pattern'
        };
        break;
      }
    }
    
    // Budget patterns
    const budgetPatterns = [
      /\$?([\d,]+)k/i,
      /\$?([\d,]+(?:\.\d+)?)\s*(?:thousand|million)/i,
      /budget\s*(?:is|of)?\s*\$?([\d,]+)/i,
      /(?:up to|max|maximum)\s*\$?([\d,]+)/i,
      /\$?([\d,]+)\s*(?:to|-)\s*\$?([\d,]+)/i
    ];
    
    for (const pattern of budgetPatterns) {
      const match = allText.match(pattern);
      if (match) {
        let value = parseFloat(match[1].replace(/,/g, ''));
        
        // Handle 'k' notation
        if (pattern.source.includes('k')) {
          value *= 1000;
        }
        
        extraction.budget = {
          value: value,
          confidence: 0.6,
          context: 'Extracted via regex pattern'
        };
        
        // Check for range
        if (match[2]) {
          extraction.budget.min = value;
          extraction.budget.max = parseFloat(match[2].replace(/,/g, ''));
        }
        break;
      }
    }
    
    // Agent status patterns
    if (/(?:have|working with|using)\s+(?:an?\s+)?(?:agent|realtor|broker)/i.test(allText)) {
      extraction.agentStatus = {
        hasAgent: true,
        confidence: 0.8,
        context: 'Detected agent mention'
      };
    } else if (/(?:no|don't have|need|looking for)\s+(?:an?\s+)?(?:agent|realtor)/i.test(allText)) {
      extraction.agentStatus = {
        hasAgent: false,
        confidence: 0.8,
        context: 'Detected no agent'
      };
    }
    
    // Financing patterns
    if (/pre[\s-]?approved/i.test(allText)) {
      extraction.financing = {
        status: 'pre-approved',
        confidence: 0.9,
        context: 'Pre-approval mentioned'
      };
      
      // Try to extract amount
      const amountMatch = allText.match(/pre[\s-]?approved\s+for\s+\$?([\d,]+)/i);
      if (amountMatch) {
        extraction.financing.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      }
    } else if (/cash\s+(?:buyer|purchase|offer)/i.test(allText)) {
      extraction.financing = {
        status: 'cash',
        confidence: 0.9,
        context: 'Cash buyer detected'
      };
    }
    
    // Escalation patterns
    const escalationPatterns = [
      { pattern: /(?:call|phone|speak|talk)\s+(?:me|to|with)/i, reason: 'human-requested' },
      { pattern: /schedule|appointment|showing|tour|view/i, reason: 'scheduling-requested' },
      { pattern: /stop|unsubscribe|opt[\s-]?out|remove/i, reason: 'opt-out' },
      { pattern: /urgent|asap|immediately|emergency/i, reason: 'high-value' }
    ];
    
    for (const { pattern, reason } of escalationPatterns) {
      if (pattern.test(allText)) {
        extraction.escalation = {
          shouldPause: true,
          reason: reason,
          confidence: 0.85,
          context: 'Escalation keyword detected'
        };
        break;
      }
    }
    
    // Location patterns
    const locationMatch = allText.match(/(?:in|at|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (locationMatch) {
      extraction.location = {
        value: locationMatch[1],
        confidence: 0.5,
        context: 'Location name detected'
      };
    }
    
    // Property type patterns
    const propertyTypes = {
      'house': /\b(?:house|home|single[\s-]?family)\b/i,
      'condo': /\b(?:condo|condominium)\b/i,
      'townhouse': /\b(?:townhouse|townhome)\b/i,
      'land': /\b(?:land|lot|acreage)\b/i,
      'multi-family': /\b(?:multi[\s-]?family|duplex|triplex)\b/i,
      'commercial': /\b(?:commercial|office|retail)\b/i
    };
    
    for (const [type, pattern] of Object.entries(propertyTypes)) {
      if (pattern.test(allText)) {
        extraction.propertyType = {
          value: type,
          confidence: 0.7,
          context: 'Property type mentioned'
        };
        break;
      }
    }
    
    // Motivation scoring based on engagement
    const urgencyWords = /urgent|asap|immediately|quickly|soon|ready/i;
    const highInterest = /excited|love|perfect|definitely|absolutely/i;
    const lowInterest = /maybe|perhaps|thinking|considering|not sure/i;
    
    if (urgencyWords.test(allText) || highInterest.test(allText)) {
      extraction.motivation = {
        value: 'high',
        confidence: 0.6,
        context: 'High motivation keywords'
      };
    } else if (lowInterest.test(allText)) {
      extraction.motivation = {
        value: 'low',
        confidence: 0.6,
        context: 'Low motivation keywords'
      };
    } else if (conversation.length > 5) {
      extraction.motivation = {
        value: 'medium',
        confidence: 0.5,
        context: 'Engaged in conversation'
      };
    }
    
    extraction.extractionMethod = 'regex';
    
    return extraction;
  }

  /**
   * Merge two extractions, preferring higher confidence values
   */
  mergeExtractions(primary, secondary) {
    if (!primary) return secondary;
    if (!secondary) return primary;
    
    const merged = { ...primary };
    
    for (const field of Object.keys(secondary)) {
      if (!merged[field]) {
        // Field doesn't exist in primary, use secondary
        merged[field] = secondary[field];
      } else if (secondary[field]?.confidence > merged[field]?.confidence) {
        // Secondary has higher confidence, use it
        merged[field] = secondary[field];
      }
    }
    
    return merged;
  }

  /**
   * Sanitize extraction to ensure it passes validation
   */
  sanitizeExtraction(extraction) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(extraction)) {
      if (value && typeof value === 'object' && 'confidence' in value) {
        // Ensure confidence is in valid range
        value.confidence = Math.max(0, Math.min(1, value.confidence || 0));
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Get extraction insights and recommendations
   */
  getInsights(extraction) {
    const insights = [];
    
    if (extraction.timeline?.confidence >= 0.7) {
      insights.push({
        type: 'timeline',
        message: `Lead wants to move ${extraction.timeline.value}`,
        priority: 'high'
      });
    }
    
    if (extraction.budget?.confidence >= 0.6) {
      insights.push({
        type: 'budget',
        message: `Budget: $${extraction.budget.value.toLocaleString()}`,
        priority: 'high'
      });
    }
    
    if (extraction.agentStatus?.hasAgent && extraction.agentStatus.confidence >= 0.7) {
      insights.push({
        type: 'agent',
        message: 'Lead already has an agent',
        priority: 'medium',
        action: 'Consider different approach'
      });
    }
    
    if (extraction.financing?.status === 'pre-approved' && extraction.financing.confidence >= 0.8) {
      insights.push({
        type: 'financing',
        message: 'Lead is pre-approved',
        priority: 'high',
        action: 'Prioritize this lead'
      });
    }
    
    if (extraction.escalation?.shouldPause) {
      insights.push({
        type: 'escalation',
        message: `Escalation needed: ${extraction.escalation.reason}`,
        priority: 'urgent',
        action: 'Human takeover required'
      });
    }
    
    return insights;
  }

  /**
   * Update CRM with extracted data
   */
  async updateCRM(leadId, extraction, adapter) {
    const updates = {};
    const customFields = {};
    
    // Map extraction to CRM fields
    if (extraction.timeline?.confidence >= this.confidenceThreshold) {
      customFields.timeline = extraction.timeline.value;
    }
    
    if (extraction.budget?.confidence >= this.confidenceThreshold) {
      customFields.budget = extraction.budget.value;
      if (extraction.budget.min && extraction.budget.max) {
        customFields.budgetRange = `${extraction.budget.min}-${extraction.budget.max}`;
      }
    }
    
    if (extraction.agentStatus?.confidence >= this.confidenceThreshold) {
      customFields.hasAgent = extraction.agentStatus.hasAgent;
    }
    
    if (extraction.financing?.confidence >= this.confidenceThreshold) {
      customFields.financingStatus = extraction.financing.status;
      if (extraction.financing.amount) {
        customFields.preApprovalAmount = extraction.financing.amount;
      }
    }
    
    if (extraction.location?.confidence >= this.confidenceThreshold) {
      updates.preferredLocation = extraction.location.value;
    }
    
    if (extraction.propertyType?.confidence >= this.confidenceThreshold) {
      customFields.propertyType = extraction.propertyType.value;
    }
    
    if (extraction.motivation?.confidence >= this.confidenceThreshold) {
      updates.leadScore = extraction.motivation.value === 'high' ? 90 : 
                           extraction.motivation.value === 'medium' ? 60 : 30;
    }
    
    // Add extraction metadata
    customFields.lastExtractionDate = new Date().toISOString();
    customFields.extractionConfidence = extraction.overallConfidence;
    customFields.extractionMethod = extraction.extractionMethod;
    
    try {
      // Update standard fields
      if (Object.keys(updates).length > 0) {
        await adapter.updateLead(leadId, updates);
      }
      
      // Update custom fields
      if (Object.keys(customFields).length > 0) {
        await adapter.updateCustomFields(leadId, customFields);
      }
      
      // Add activity note
      await adapter.addActivity(leadId, {
        type: 'note',
        content: `AI Extraction completed with ${Math.round(extraction.overallConfidence * 100)}% confidence. ${this.getInsights(extraction).length} insights found.`,
        metadata: { extraction }
      });
      
      console.log(`✅ CRM updated for lead ${leadId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to update CRM for lead ${leadId}:`, error);
      return false;
    }
  }
}

module.exports = ExtractionService;