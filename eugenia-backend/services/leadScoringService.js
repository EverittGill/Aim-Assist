/**
 * Lead Scoring Service
 * Advanced scoring algorithm to identify high-value leads and buying signals
 */

class LeadScoringService {
  constructor() {
    // Scoring weights
    this.weights = {
      timeline: 30,        // When they plan to buy
      financing: 25,       // Pre-approved or cash
      engagement: 20,      // Response rate and quality
      urgency: 15,         // Urgency indicators
      specificity: 10      // How specific their requirements are
    };

    // Urgency indicators
    this.urgencyKeywords = [
      'asap', 'immediately', 'urgent', 'right away', 'today', 'tomorrow',
      'this week', 'next week', 'soon', 'quickly', 'fast',
      'relocating', 'job transfer', 'school starts', 'lease ending',
      'contract ending', 'moving', 'need to move'
    ];

    // Life events that indicate buying readiness
    this.lifeEvents = [
      'baby', 'married', 'wedding', 'divorce', 'retirement', 'retiring',
      'new job', 'promotion', 'transfer', 'relocating', 'downsize', 'upsize',
      'empty nest', 'kids', 'school', 'pregnant', 'growing family'
    ];

    // High-intent phrases
    this.highIntentPhrases = [
      'ready to buy', 'want to buy', 'looking to purchase',
      'need to find', 'must have', 'dream home', 'perfect home',
      'put in an offer', 'make an offer', 'view properties',
      'schedule showing', 'see homes', 'tour homes'
    ];

    // Price sensitivity indicators
    this.priceSensitivityKeywords = [
      'budget', 'afford', 'payment', 'monthly', 'expensive',
      'cheap', 'reasonable', 'negotiable', 'flexible on price',
      'best deal', 'good value', 'worth it'
    ];
  }

  /**
   * Calculate comprehensive lead score
   * @param {Object} leadDetails - Lead information
   * @param {Array} messages - Conversation history
   * @param {Object} qualificationStatus - Current qualification status
   * @returns {Object} Lead score with breakdown
   */
  calculateScore(leadDetails, messages, qualificationStatus) {
    const scores = {
      timeline: this.scoreTimeline(messages, qualificationStatus),
      financing: this.scoreFinancing(messages, qualificationStatus),
      engagement: this.scoreEngagement(messages),
      urgency: this.scoreUrgency(messages),
      specificity: this.scoreSpecificity(messages),
      total: 0,
      grade: '',
      recommendation: '',
      insights: []
    };

    // Calculate weighted total
    scores.total = Object.keys(this.weights).reduce((total, key) => {
      return total + (scores[key] * this.weights[key] / 100);
    }, 0);

    // Assign grade
    if (scores.total >= 85) {
      scores.grade = 'A - Hot Lead';
      scores.recommendation = 'Contact immediately - high conversion probability';
    } else if (scores.total >= 70) {
      scores.grade = 'B - Warm Lead';
      scores.recommendation = 'Priority follow-up within 1 hour';
    } else if (scores.total >= 50) {
      scores.grade = 'C - Nurture Lead';
      scores.recommendation = 'Continue automated nurturing';
    } else {
      scores.grade = 'D - Cold Lead';
      scores.recommendation = 'Low priority - check in periodically';
    }

    // Generate insights
    scores.insights = this.generateInsights(scores, messages, leadDetails);

    return scores;
  }

  /**
   * Score timeline component
   */
  scoreTimeline(messages, qualificationStatus) {
    let score = 0;
    
    // Check qualification status first
    if (qualificationStatus?.qualifyingQuestions?.timeline?.answered) {
      const timeline = qualificationStatus.qualifyingQuestions.timeline.response?.toLowerCase() || '';
      
      if (timeline.includes('immediate') || timeline.includes('asap') || timeline.includes('this week')) {
        score = 100;
      } else if (timeline.includes('month') || timeline.includes('30 days')) {
        score = 80;
      } else if (timeline.includes('3 month') || timeline.includes('90 days')) {
        score = 60;
      } else if (timeline.includes('6 month')) {
        score = 40;
      } else if (timeline.includes('year')) {
        score = 20;
      } else {
        score = 50; // Unknown but answered
      }
    }

    // Check messages for timeline indicators
    messages.forEach(msg => {
      if (msg.direction === 'inbound') {
        const content = (msg.content || msg.text || '').toLowerCase();
        if (content.includes('ready now') || content.includes('right away')) {
          score = Math.max(score, 95);
        }
      }
    });

    return score;
  }

  /**
   * Score financing readiness
   */
  scoreFinancing(messages, qualificationStatus) {
    let score = 0;

    // Check qualification status
    if (qualificationStatus?.qualifyingQuestions?.financing?.answered) {
      const financing = qualificationStatus.qualifyingQuestions.financing.response?.toLowerCase() || '';
      
      if (financing.includes('cash')) {
        score = 100;
      } else if (financing.includes('pre-approved') || financing.includes('preapproved')) {
        score = 85;
      } else if (financing.includes('working with') || financing.includes('lender')) {
        score = 60;
      } else {
        score = 30;
      }
    }

    return score;
  }

  /**
   * Score engagement level
   */
  scoreEngagement(messages) {
    const leadMessages = messages.filter(m => m.direction === 'inbound');
    
    if (leadMessages.length === 0) return 0;

    let score = 0;

    // Response rate (assuming we sent at least as many)
    const responseRate = Math.min(leadMessages.length / Math.max(messages.length / 2, 1), 1);
    score += responseRate * 40;

    // Message quality (length indicates engagement)
    const avgLength = leadMessages.reduce((sum, msg) => {
      return sum + (msg.content || msg.text || '').length;
    }, 0) / leadMessages.length;

    if (avgLength > 100) score += 30;
    else if (avgLength > 50) score += 20;
    else if (avgLength > 20) score += 10;

    // Response speed (if we have timestamps)
    const quickResponses = this.countQuickResponses(messages);
    score += Math.min(quickResponses * 10, 30);

    return Math.min(score, 100);
  }

  /**
   * Score urgency indicators
   */
  scoreUrgency(messages) {
    let score = 0;
    let urgencyCount = 0;
    let lifeEventDetected = false;

    messages.forEach(msg => {
      if (msg.direction === 'inbound') {
        const content = (msg.content || msg.text || '').toLowerCase();
        
        // Check urgency keywords
        this.urgencyKeywords.forEach(keyword => {
          if (content.includes(keyword)) {
            urgencyCount++;
          }
        });

        // Check life events
        this.lifeEvents.forEach(event => {
          if (content.includes(event)) {
            lifeEventDetected = true;
          }
        });

        // Check high-intent phrases
        this.highIntentPhrases.forEach(phrase => {
          if (content.includes(phrase)) {
            score += 20;
          }
        });
      }
    });

    // Calculate urgency score
    score += Math.min(urgencyCount * 15, 50);
    if (lifeEventDetected) score += 30;

    return Math.min(score, 100);
  }

  /**
   * Score specificity of requirements
   */
  scoreSpecificity(messages) {
    let score = 0;
    const requirements = new Set();

    const specificPatterns = [
      /\d+\s*(bed|br|bedroom)/i,
      /\d+\s*(bath|ba|bathroom)/i,
      /\d+\s*(car|garage)/i,
      /\d+\s*(sq|square|sqft)/i,
      /\$[\d,]+/,
      /school|district/i,
      /pool|yard|garden/i,
      /new|construction|built/i
    ];

    messages.forEach(msg => {
      if (msg.direction === 'inbound') {
        const content = (msg.content || msg.text || '');
        
        specificPatterns.forEach(pattern => {
          if (pattern.test(content)) {
            requirements.add(pattern.source);
          }
        });
      }
    });

    // Score based on number of specific requirements
    score = Math.min(requirements.size * 15, 100);

    return score;
  }

  /**
   * Count quick responses (under 5 minutes)
   */
  countQuickResponses(messages) {
    let quickResponses = 0;
    
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].direction === 'inbound' && messages[i-1].direction === 'outbound') {
        const prevTime = new Date(messages[i-1].timestamp || messages[i-1].createdAt);
        const currTime = new Date(messages[i].timestamp || messages[i].createdAt);
        const diffMinutes = (currTime - prevTime) / 60000;
        
        if (diffMinutes < 5) {
          quickResponses++;
        }
      }
    }
    
    return quickResponses;
  }

  /**
   * Generate actionable insights
   */
  generateInsights(scores, messages, leadDetails) {
    const insights = [];

    // Timeline insights
    if (scores.timeline >= 80) {
      insights.push('🔥 Immediate buyer - prioritize this lead');
    } else if (scores.timeline <= 40) {
      insights.push('📅 Long-term nurture needed');
    }

    // Financing insights
    if (scores.financing >= 85) {
      insights.push('💰 Financially ready - cash or pre-approved');
    } else if (scores.financing <= 30) {
      insights.push('🏦 Needs financing assistance');
    }

    // Engagement insights
    if (scores.engagement >= 70) {
      insights.push('📱 Highly engaged - responds quickly and thoroughly');
    } else if (scores.engagement <= 30) {
      insights.push('😴 Low engagement - try different approach');
    }

    // Urgency insights
    if (scores.urgency >= 70) {
      insights.push('⚡ High urgency detected - life event or deadline');
    }

    // Specificity insights
    if (scores.specificity >= 70) {
      insights.push('🎯 Very specific requirements - knows what they want');
    } else if (scores.specificity <= 30) {
      insights.push('🔍 Still exploring - needs guidance');
    }

    // Price sensitivity
    const priceSensitive = this.detectPriceSensitivity(messages);
    if (priceSensitive) {
      insights.push('💵 Price sensitive - emphasize value');
    }

    return insights;
  }

  /**
   * Detect price sensitivity
   */
  detectPriceSensitivity(messages) {
    let sensitivityCount = 0;
    
    messages.forEach(msg => {
      if (msg.direction === 'inbound') {
        const content = (msg.content || msg.text || '').toLowerCase();
        this.priceSensitivityKeywords.forEach(keyword => {
          if (content.includes(keyword)) {
            sensitivityCount++;
          }
        });
      }
    });
    
    return sensitivityCount >= 2;
  }

  /**
   * Get recommended next action based on score
   */
  getNextAction(scores, qualificationStatus) {
    if (scores.total >= 85) {
      return {
        action: 'immediate_handoff',
        message: 'Schedule call with agent immediately',
        priority: 1
      };
    } else if (scores.total >= 70) {
      if (!qualificationStatus?.qualifyingQuestions?.timeline?.answered) {
        return {
          action: 'ask_timeline',
          message: 'Discover their timeline',
          priority: 2
        };
      } else if (!qualificationStatus?.qualifyingQuestions?.financing?.answered) {
        return {
          action: 'ask_financing',
          message: 'Understand financing situation',
          priority: 2
        };
      }
    } else if (scores.engagement < 50) {
      return {
        action: 'engagement_boost',
        message: 'Try a different conversation approach',
        priority: 3
      };
    }

    return {
      action: 'continue_nurture',
      message: 'Continue building rapport',
      priority: 4
    };
  }
}

module.exports = new LeadScoringService();