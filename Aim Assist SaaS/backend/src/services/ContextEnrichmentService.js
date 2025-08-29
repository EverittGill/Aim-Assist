/**
 * Context Enrichment Service
 * Fetches additional CRM data to provide full context for AI and extraction
 * Includes property views, lead activities, custom fields, and behavioral data
 */

const CRMFactory = require('./crm/CRMFactory');

class ContextEnrichmentService {
  constructor(organizationId, config = {}) {
    // Compatibility layer during migration
    this.organizationId = organizationId;
    this.organizationId = organizationId; // Keep for backward compatibility
    this.cacheTimeout = config.cacheTimeout || 300000; // 5 minutes
    this.contextCache = new Map();
    this.maxActivities = config.maxActivities || 50;
    this.maxPropertyViews = config.maxPropertyViews || 20;
  }

  /**
   * Get full enriched context for a lead
   */
  async getEnrichedContext(leadId, options = {}) {
    try {
      console.log(`🔍 Enriching context for lead ${leadId}`);
      
      // Check cache first
      const cacheKey = `${this.organizationId}-${leadId}`;
      const cached = this.contextCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('✅ Using cached context');
        return cached.data;
      }
      
      // Get CRM adapter
      const adapter = await CRMFactory.getAdapter(this.organizationId);
      
      // Fetch all context data in parallel
      const [
        leadProfile,
        activities,
        propertyViews,
        customFields,
        conversations,
        leadScore
      ] = await Promise.all([
        this.getLeadProfile(adapter, leadId),
        this.getLeadActivities(adapter, leadId),
        this.getPropertyViews(adapter, leadId),
        this.getCustomFields(adapter, leadId),
        this.getConversationSummary(adapter, leadId),
        this.calculateLeadScore(adapter, leadId)
      ]);
      
      // Build enriched context
      const enrichedContext = {
        leadId,
        organizationId: this.organizationId,
        
        // Basic lead information
        profile: {
          ...leadProfile,
          fullName: `${leadProfile.first_name || ''} ${leadProfile.last_name || ''}`.trim(),
          preferredContact: leadProfile.preferred_contact || 'sms'
        },
        
        // Behavioral data
        behavior: {
          totalActivities: activities.length,
          lastActivity: activities[0]?.created_at || null,
          engagementLevel: this.calculateEngagement(activities),
          responseTime: this.calculateAverageResponseTime(conversations),
          preferredTimeOfDay: this.getPreferredTimeOfDay(activities)
        },
        
        // Property interests
        propertyInterests: {
          viewedProperties: propertyViews,
          totalViews: propertyViews.length,
          favoriteTypes: this.extractFavoritePropertyTypes(propertyViews),
          priceRange: this.extractPriceRange(propertyViews),
          locationPreferences: this.extractLocationPreferences(propertyViews)
        },
        
        // Timeline and readiness
        timeline: {
          estimatedTimeline: customFields.timeline || this.estimateTimeline(activities),
          urgencyScore: this.calculateUrgency(activities, conversations),
          qualificationStatus: customFields.qualificationStatus || 'unknown'
        },
        
        // Financial information
        financial: {
          budget: customFields.budget || this.estimateBudget(propertyViews),
          financingStatus: customFields.financingStatus || 'unknown',
          preApprovalAmount: customFields.preApprovalAmount || null
        },
        
        // Conversation insights
        conversationInsights: {
          totalMessages: conversations.messageCount || 0,
          sentiment: this.analyzeSentiment(conversations),
          topicsCovered: this.extractTopics(conversations),
          unansweredQuestions: this.findUnansweredQuestions(conversations)
        },
        
        // AI recommendations
        aiRecommendations: {
          nextBestAction: this.recommendNextAction(leadScore, activities),
          messagingTone: this.recommendTone(leadProfile, conversations),
          topicsToAvoid: this.identifyTopicsToAvoid(conversations),
          topicsToExplore: this.identifyTopicsToExplore(propertyViews, conversations)
        },
        
        // Metadata
        enrichmentMetadata: {
          timestamp: new Date().toISOString(),
          dataCompleteness: this.calculateDataCompleteness({
            leadProfile, activities, propertyViews, customFields
          }),
          leadScore: leadScore
        }
      };
      
      // Cache the enriched context
      this.contextCache.set(cacheKey, {
        timestamp: Date.now(),
        data: enrichedContext
      });
      
      console.log('✅ Context enrichment complete');
      return enrichedContext;
      
    } catch (error) {
      console.error('❌ Context enrichment failed:', error);
      
      // Return minimal context on error
      return {
        leadId,
        organizationId: this.organizationId,
        profile: { id: leadId },
        error: error.message,
        enrichmentMetadata: {
          timestamp: new Date().toISOString(),
          dataCompleteness: 0
        }
      };
    }
  }

  /**
   * Get lead profile with all available fields
   */
  async getLeadProfile(adapter, leadId) {
    try {
      const lead = await adapter.getLead(leadId);
      return {
        ...lead,
        // Normalize phone numbers
        phone: this.normalizePhone(lead.phone),
        alternatePhones: (lead.alternatePhones || []).map(p => this.normalizePhone(p))
      };
    } catch (error) {
      console.error('Failed to get lead profile:', error);
      return { id: leadId };
    }
  }

  /**
   * Get lead activities (calls, emails, texts, notes)
   */
  async getLeadActivities(adapter, leadId) {
    try {
      const activities = await adapter.getActivities(leadId, {
        limit: this.maxActivities,
        types: ['call', 'email', 'sms', 'note', 'viewing']
      });
      
      return activities.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
    } catch (error) {
      console.error('Failed to get lead activities:', error);
      return [];
    }
  }

  /**
   * Get properties viewed by the lead
   */
  async getPropertyViews(adapter, leadId) {
    try {
      const views = await adapter.getPropertyViews(leadId, {
        limit: this.maxPropertyViews
      });
      
      return views.map(view => ({
        ...view,
        viewDuration: view.duration || 0,
        viewCount: view.count || 1,
        lastViewed: view.last_viewed || view.created_at,
        propertyDetails: this.parsePropertyDetails(view)
      }));
    } catch (error) {
      console.error('Failed to get property views:', error);
      return [];
    }
  }

  /**
   * Get all custom fields for the lead
   */
  async getCustomFields(adapter, leadId) {
    try {
      return await adapter.getCustomFields(leadId) || {};
    } catch (error) {
      console.error('Failed to get custom fields:', error);
      return {};
    }
  }

  /**
   * Get conversation summary
   */
  async getConversationSummary(adapter, leadId) {
    try {
      const messages = await adapter.getConversationHistory(leadId, {
        limit: 100
      });
      
      return {
        messages: messages,
        messageCount: messages.length,
        firstMessage: messages[0],
        lastMessage: messages[messages.length - 1],
        averageResponseTime: this.calculateAverageResponseTime(messages)
      };
    } catch (error) {
      console.error('Failed to get conversation summary:', error);
      return { messages: [], messageCount: 0 };
    }
  }

  /**
   * Calculate lead score based on various factors
   */
  async calculateLeadScore(adapter, leadId) {
    try {
      // Get scoring factors
      const lead = await adapter.getLead(leadId);
      const activities = await adapter.getActivities(leadId, { limit: 20 });
      const propertyViews = await adapter.getPropertyViews(leadId, { limit: 10 });
      
      let score = 50; // Base score
      
      // Source scoring
      const highValueSources = ['referral', 'direct', 'organic'];
      if (highValueSources.includes(lead.source?.toLowerCase())) {
        score += 10;
      }
      
      // Engagement scoring
      if (activities.length > 10) score += 15;
      else if (activities.length > 5) score += 10;
      else if (activities.length > 2) score += 5;
      
      // Property view scoring
      if (propertyViews.length > 5) score += 15;
      else if (propertyViews.length > 2) score += 10;
      else if (propertyViews.length > 0) score += 5;
      
      // Response rate scoring
      const responseRate = this.calculateResponseRate(activities);
      if (responseRate > 0.8) score += 10;
      else if (responseRate > 0.5) score += 5;
      
      // Cap at 100
      return Math.min(100, score);
      
    } catch (error) {
      console.error('Failed to calculate lead score:', error);
      return 50; // Default middle score
    }
  }

  /**
   * Calculate engagement level from activities
   */
  calculateEngagement(activities) {
    if (activities.length === 0) return 'cold';
    
    const recentActivities = activities.filter(a => {
      const daysSince = (Date.now() - new Date(a.created_at)) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    });
    
    if (recentActivities.length >= 5) return 'hot';
    if (recentActivities.length >= 2) return 'warm';
    return 'cooling';
  }

  /**
   * Calculate average response time from conversations
   */
  calculateAverageResponseTime(conversations) {
    if (!conversations.messages || conversations.messages.length < 2) {
      return null;
    }
    
    const responseTimes = [];
    let lastOutbound = null;
    
    for (const msg of conversations.messages) {
      if (msg.direction === 'outbound') {
        lastOutbound = new Date(msg.created_at);
      } else if (msg.direction === 'inbound' && lastOutbound) {
        const responseTime = new Date(msg.created_at) - lastOutbound;
        responseTimes.push(responseTime);
        lastOutbound = null;
      }
    }
    
    if (responseTimes.length === 0) return null;
    
    const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    return Math.round(average / (1000 * 60)); // Return in minutes
  }

  /**
   * Determine preferred time of day for communication
   */
  getPreferredTimeOfDay(activities) {
    const hourCounts = new Array(24).fill(0);
    
    activities.forEach(activity => {
      const hour = new Date(activity.created_at).getHours();
      hourCounts[hour]++;
    });
    
    const maxHour = hourCounts.indexOf(Math.max(...hourCounts));
    
    if (maxHour < 12) return 'morning';
    if (maxHour < 17) return 'afternoon';
    return 'evening';
  }

  /**
   * Extract favorite property types from views
   */
  extractFavoritePropertyTypes(propertyViews) {
    const typeCounts = {};
    
    propertyViews.forEach(view => {
      const type = view.property_type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  /**
   * Extract price range from property views
   */
  extractPriceRange(propertyViews) {
    const prices = propertyViews
      .map(v => v.price)
      .filter(p => p && p > 0);
    
    if (prices.length === 0) return null;
    
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      average: prices.reduce((a, b) => a + b, 0) / prices.length
    };
  }

  /**
   * Extract location preferences from property views
   */
  extractLocationPreferences(propertyViews) {
    const locationCounts = {};
    
    propertyViews.forEach(view => {
      const location = view.city || view.neighborhood || 'unknown';
      locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    return Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location]) => location);
  }

  /**
   * Estimate timeline based on activities
   */
  estimateTimeline(activities) {
    const urgentKeywords = /urgent|asap|immediately|soon/i;
    const nearTermKeywords = /month|weeks|spring|summer|fall|winter/i;
    const longTermKeywords = /year|eventually|someday|future/i;
    
    for (const activity of activities) {
      if (activity.content) {
        if (urgentKeywords.test(activity.content)) return '0-1 month';
        if (nearTermKeywords.test(activity.content)) return '1-3 months';
        if (longTermKeywords.test(activity.content)) return '6+ months';
      }
    }
    
    return '3-6 months'; // Default
  }

  /**
   * Calculate urgency score
   */
  calculateUrgency(activities, conversations) {
    let urgencyScore = 5; // Base score
    
    // Recent activity increases urgency
    const recentActivities = activities.filter(a => {
      const hoursSince = (Date.now() - new Date(a.created_at)) / (1000 * 60 * 60);
      return hoursSince <= 24;
    });
    
    urgencyScore += Math.min(3, recentActivities.length);
    
    // Quick responses increase urgency
    const avgResponse = this.calculateAverageResponseTime(conversations);
    if (avgResponse && avgResponse < 60) urgencyScore += 2; // Under 1 hour
    
    return Math.min(10, urgencyScore);
  }

  /**
   * Estimate budget from property views
   */
  estimateBudget(propertyViews) {
    const priceRange = this.extractPriceRange(propertyViews);
    if (!priceRange) return null;
    
    // Assume they're looking 10-20% above and below their target
    return Math.round(priceRange.average);
  }

  /**
   * Analyze sentiment from conversations
   */
  analyzeSentiment(conversations) {
    if (!conversations.messages || conversations.messages.length === 0) {
      return 'neutral';
    }
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    const positiveWords = /great|excellent|perfect|love|excited|wonderful|amazing/i;
    const negativeWords = /not interested|no thanks|stop|disappointed|frustrated|angry/i;
    
    conversations.messages.forEach(msg => {
      if (positiveWords.test(msg.content)) positiveCount++;
      if (negativeWords.test(msg.content)) negativeCount++;
    });
    
    if (positiveCount > negativeCount * 2) return 'positive';
    if (negativeCount > positiveCount * 2) return 'negative';
    return 'neutral';
  }

  /**
   * Extract topics from conversations
   */
  extractTopics(conversations) {
    const topics = new Set();
    
    const topicPatterns = {
      'price': /price|cost|afford|budget|financing/i,
      'location': /location|area|neighborhood|school|commute/i,
      'features': /bedroom|bathroom|garage|yard|pool|kitchen/i,
      'timeline': /when|move|ready|urgent|asap/i,
      'process': /offer|contract|inspection|closing|agent/i
    };
    
    conversations.messages?.forEach(msg => {
      Object.entries(topicPatterns).forEach(([topic, pattern]) => {
        if (pattern.test(msg.content)) {
          topics.add(topic);
        }
      });
    });
    
    return Array.from(topics);
  }

  /**
   * Find unanswered questions in conversations
   */
  findUnansweredQuestions(conversations) {
    const questions = [];
    let lastQuestion = null;
    
    conversations.messages?.forEach((msg, index) => {
      if (msg.content.includes('?') && msg.direction === 'inbound') {
        lastQuestion = msg.content;
      } else if (lastQuestion && msg.direction === 'outbound') {
        // Check if the response actually answered the question
        const questionWords = lastQuestion.toLowerCase().match(/\b(what|when|where|why|how|which|who)\b/g);
        if (questionWords && !this.containsAnswer(msg.content, questionWords[0])) {
          questions.push(lastQuestion);
        }
        lastQuestion = null;
      }
    });
    
    if (lastQuestion) {
      questions.push(lastQuestion);
    }
    
    return questions.slice(-3); // Return last 3 unanswered questions
  }

  /**
   * Check if response contains answer to question type
   */
  containsAnswer(response, questionWord) {
    const answerPatterns = {
      'what': /is|are|it's|they're/i,
      'when': /on|at|in|during|after|before/i,
      'where': /at|in|near|by|location/i,
      'why': /because|since|due to|reason/i,
      'how': /by|through|via|using|with/i,
      'which': /this|that|these|those/i,
      'who': /I|we|they|he|she|agent/i
    };
    
    return answerPatterns[questionWord]?.test(response) || false;
  }

  /**
   * Recommend next best action
   */
  recommendNextAction(leadScore, activities) {
    if (leadScore >= 80) {
      return 'Schedule property showing';
    } else if (leadScore >= 60) {
      return 'Send personalized property recommendations';
    } else if (activities.length === 0) {
      return 'Send initial engagement message';
    } else if (activities.length < 3) {
      return 'Follow up to build rapport';
    } else {
      return 'Nurture with valuable content';
    }
  }

  /**
   * Recommend messaging tone
   */
  recommendTone(leadProfile, conversations) {
    const sentiment = this.analyzeSentiment(conversations);
    
    if (sentiment === 'positive') {
      return 'enthusiastic';
    } else if (sentiment === 'negative') {
      return 'empathetic';
    } else if (leadProfile.source === 'referral') {
      return 'professional';
    } else {
      return 'friendly';
    }
  }

  /**
   * Identify topics to avoid
   */
  identifyTopicsToAvoid(conversations) {
    const avoidTopics = [];
    
    // Check for negative reactions to certain topics
    const negativePatterns = {
      'commission': /commission|fee|cost.*agent/i,
      'commitment': /contract|exclusive|sign/i,
      'personal': /divorce|financial.*problem|foreclosure/i
    };
    
    conversations.messages?.forEach((msg, index) => {
      Object.entries(negativePatterns).forEach(([topic, pattern]) => {
        if (pattern.test(msg.content) && index < conversations.messages.length - 1) {
          const nextMsg = conversations.messages[index + 1];
          if (nextMsg.direction === 'inbound' && /no|not|don't|stop/i.test(nextMsg.content)) {
            avoidTopics.push(topic);
          }
        }
      });
    });
    
    return [...new Set(avoidTopics)];
  }

  /**
   * Identify topics to explore
   */
  identifyTopicsToExplore(propertyViews, conversations) {
    const topics = [];
    
    // Based on property views
    if (propertyViews.length > 0) {
      const types = this.extractFavoritePropertyTypes(propertyViews);
      if (types.length > 0) {
        topics.push(`${types[0]} properties`);
      }
      
      const locations = this.extractLocationPreferences(propertyViews);
      if (locations.length > 0) {
        topics.push(`Properties in ${locations[0]}`);
      }
    }
    
    // Based on unanswered questions
    const unanswered = this.findUnansweredQuestions(conversations);
    unanswered.forEach(q => {
      if (q.includes('school')) topics.push('School districts');
      if (q.includes('commute')) topics.push('Commute times');
      if (q.includes('neighbor')) topics.push('Neighborhood amenities');
    });
    
    return [...new Set(topics)].slice(0, 3);
  }

  /**
   * Calculate response rate
   */
  calculateResponseRate(activities) {
    const outboundMessages = activities.filter(a => 
      a.type === 'sms' && a.direction === 'outbound'
    );
    const inboundMessages = activities.filter(a => 
      a.type === 'sms' && a.direction === 'inbound'
    );
    
    if (outboundMessages.length === 0) return 0;
    
    return Math.min(1, inboundMessages.length / outboundMessages.length);
  }

  /**
   * Parse property details from view data
   */
  parsePropertyDetails(view) {
    return {
      type: view.property_type || 'unknown',
      price: view.price || 0,
      bedrooms: view.bedrooms || 0,
      bathrooms: view.bathrooms || 0,
      sqft: view.sqft || 0,
      address: view.address || '',
      city: view.city || '',
      state: view.state || '',
      zip: view.zip || ''
    };
  }

  /**
   * Calculate data completeness score
   */
  calculateDataCompleteness(data) {
    let score = 0;
    let total = 0;
    
    // Check lead profile completeness
    const profileFields = ['first_name', 'last_name', 'email', 'phone'];
    profileFields.forEach(field => {
      total++;
      if (data.leadProfile?.[field]) score++;
    });
    
    // Check activity data
    total++;
    if (data.activities?.length > 0) score++;
    
    // Check property views
    total++;
    if (data.propertyViews?.length > 0) score++;
    
    // Check custom fields
    const customFieldKeys = Object.keys(data.customFields || {});
    total++;
    if (customFieldKeys.length > 0) score++;
    
    return total > 0 ? (score / total) : 0;
  }

  /**
   * Normalize phone number
   */
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    
    return phone; // Return original if can't normalize
  }

  /**
   * Format context for AI consumption
   */
  formatForAI(enrichedContext) {
    return {
      lead: {
        name: enrichedContext.profile.fullName,
        engagement: enrichedContext.behavior.engagementLevel,
        timeline: enrichedContext.timeline.estimatedTimeline,
        budget: enrichedContext.financial.budget,
        leadScore: enrichedContext.enrichmentMetadata.leadScore
      },
      insights: {
        favoritePropertyTypes: enrichedContext.propertyInterests.favoriteTypes,
        preferredLocations: enrichedContext.propertyInterests.locationPreferences,
        sentiment: enrichedContext.conversationInsights.sentiment,
        unansweredQuestions: enrichedContext.conversationInsights.unansweredQuestions
      },
      recommendations: enrichedContext.aiRecommendations
    };
  }
}

module.exports = ContextEnrichmentService;