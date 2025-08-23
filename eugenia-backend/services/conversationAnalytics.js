/**
 * Conversation Analytics Service
 * Tracks patterns, measures success, and provides insights
 */

const fs = require('fs').promises;
const path = require('path');

class ConversationAnalytics {
  constructor() {
    this.analyticsFile = path.join(__dirname, '../data/conversation-analytics.json');
    this.patternsFile = path.join(__dirname, '../data/success-patterns.json');
    this.analytics = null;
    this.patterns = null;
    this.loadAnalytics();
  }

  async loadAnalytics() {
    try {
      // Load existing analytics
      try {
        const data = await fs.readFile(this.analyticsFile, 'utf8');
        this.analytics = JSON.parse(data);
      } catch (err) {
        // Initialize if doesn't exist
        this.analytics = this.getDefaultAnalytics();
      }

      // Load success patterns
      try {
        const patternsData = await fs.readFile(this.patternsFile, 'utf8');
        this.patterns = JSON.parse(patternsData);
      } catch (err) {
        this.patterns = this.getDefaultPatterns();
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }

  getDefaultAnalytics() {
    return {
      totalConversations: 0,
      totalMessages: 0,
      qualificationRate: 0,
      averageMessagesToQualification: 0,
      responseRates: {},
      dropOffPoints: {},
      successfulOpenings: {},
      conversionsBySource: {},
      timeToResponseStats: [],
      lastUpdated: new Date().toISOString()
    };
  }

  getDefaultPatterns() {
    return {
      highConversionOpenings: [],
      effectiveQualificationPhrases: [],
      engagementBoosters: [],
      optimalResponseTimes: {},
      successfulClosingStatements: []
    };
  }

  /**
   * Track a conversation interaction
   */
  async trackInteraction(leadId, interaction) {
    const { 
      messageNumber,
      messageType, // 'opening', 'qualification', 'response', 'closing'
      content,
      source,
      responseTime,
      ledToQualification,
      ledToScheduling
    } = interaction;

    // Update general statistics
    this.analytics.totalMessages++;
    
    // Track response times
    if (responseTime) {
      this.analytics.timeToResponseStats.push(responseTime);
    }

    // Track by source
    if (!this.analytics.conversionsBySource[source]) {
      this.analytics.conversionsBySource[source] = {
        total: 0,
        qualified: 0,
        scheduled: 0
      };
    }
    this.analytics.conversionsBySource[source].total++;

    if (ledToQualification) {
      this.analytics.conversionsBySource[source].qualified++;
    }
    
    if (ledToScheduling) {
      this.analytics.conversionsBySource[source].scheduled++;
    }

    // Track successful openings
    if (messageType === 'opening' && ledToQualification) {
      if (!this.analytics.successfulOpenings[content]) {
        this.analytics.successfulOpenings[content] = 0;
      }
      this.analytics.successfulOpenings[content]++;
    }

    // Save analytics
    await this.saveAnalytics();
  }

  /**
   * Analyze conversation for patterns
   */
  analyzeConversationPattern(messages, qualificationStatus, leadScore) {
    const analysis = {
      pattern: [],
      effectiveness: 0,
      dropOffRisk: 0,
      recommendations: []
    };

    // Identify conversation pattern
    let lastResponseTime = null;
    let totalResponseTime = 0;
    let responseCount = 0;
    let questionAnswerRatio = 0;

    messages.forEach((msg, index) => {
      // Track response times
      if (msg.direction === 'inbound' && lastResponseTime) {
        const responseTime = new Date(msg.timestamp) - lastResponseTime;
        totalResponseTime += responseTime;
        responseCount++;
      }
      
      if (msg.direction === 'outbound') {
        lastResponseTime = new Date(msg.timestamp);
      }

      // Identify pattern elements
      const content = (msg.content || msg.text || '').toLowerCase();
      if (content.includes('?')) {
        analysis.pattern.push('question');
        questionAnswerRatio++;
      } else if (msg.direction === 'inbound' && content.length > 50) {
        analysis.pattern.push('detailed_response');
      } else if (msg.direction === 'inbound' && content.length < 20) {
        analysis.pattern.push('short_response');
      }
    });

    // Calculate effectiveness
    if (qualificationStatus.qualificationComplete) {
      analysis.effectiveness = 90;
    } else if (qualificationStatus.qualifyingQuestions) {
      const answered = Object.values(qualificationStatus.qualifyingQuestions)
        .filter(q => q.answered).length;
      analysis.effectiveness = (answered / 3) * 70;
    }

    // Add lead score impact
    if (leadScore) {
      analysis.effectiveness = (analysis.effectiveness + leadScore.total) / 2;
    }

    // Calculate drop-off risk
    const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    const recentMessages = messages.slice(-3);
    const recentShortResponses = recentMessages.filter(m => 
      m.direction === 'inbound' && (m.content || '').length < 20
    ).length;

    if (recentShortResponses >= 2) {
      analysis.dropOffRisk = 70;
      analysis.recommendations.push('Lead showing disengagement - try a different approach');
    } else if (avgResponseTime > 3600000) { // Over 1 hour average
      analysis.dropOffRisk = 50;
      analysis.recommendations.push('Slow response times - consider more engaging questions');
    } else {
      analysis.dropOffRisk = 20;
    }

    // Generate recommendations
    if (questionAnswerRatio > messages.length * 0.3) {
      analysis.recommendations.push('Too many questions - focus on building rapport');
    }

    if (!qualificationStatus.qualifyingQuestions?.timeline?.answered) {
      analysis.recommendations.push('Priority: Discover their timeline');
    }

    if (leadScore && leadScore.total > 70 && !qualificationStatus.qualificationComplete) {
      analysis.recommendations.push('High-value lead - move toward scheduling');
    }

    return analysis;
  }

  /**
   * Get best performing content by type
   */
  async getBestPerformers(type = 'opening') {
    const performers = [];
    
    switch(type) {
      case 'opening':
        // Sort successful openings by count
        Object.entries(this.analytics.successfulOpenings || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([content, count]) => {
            performers.push({
              content,
              successCount: count,
              type: 'opening'
            });
          });
        break;
        
      case 'qualification':
        // Get best qualification phrases from patterns
        (this.patterns.effectiveQualificationPhrases || [])
          .slice(0, 5)
          .forEach(phrase => {
            performers.push({
              content: phrase.content,
              conversionRate: phrase.conversionRate,
              type: 'qualification'
            });
          });
        break;
    }
    
    return performers;
  }

  /**
   * Suggest optimal message based on context
   */
  suggestOptimalMessage(context) {
    const { source, messageNumber, lastResponse, qualificationStatus } = context;
    
    const suggestions = [];
    
    // Check source-specific patterns
    const sourceData = this.analytics.conversionsBySource[source];
    if (sourceData && sourceData.qualified > 0) {
      const conversionRate = sourceData.qualified / sourceData.total;
      if (conversionRate > 0.3) {
        suggestions.push({
          confidence: 'high',
          reason: `${(conversionRate * 100).toFixed(0)}% conversion rate from ${source}`,
          approach: 'direct'
        });
      }
    }
    
    // Check message timing
    if (messageNumber === 1) {
      const bestOpening = Object.entries(this.analytics.successfulOpenings || {})
        .sort((a, b) => b[1] - a[1])[0];
      
      if (bestOpening) {
        suggestions.push({
          confidence: 'medium',
          template: bestOpening[0],
          successCount: bestOpening[1]
        });
      }
    }
    
    // Check qualification gaps
    if (!qualificationStatus.qualifyingQuestions?.timeline?.answered) {
      suggestions.push({
        confidence: 'high',
        focus: 'timeline',
        reason: 'Timeline is the most important qualifier'
      });
    }
    
    return suggestions;
  }

  /**
   * Track A/B test results
   */
  async trackABTest(testId, variant, success) {
    if (!this.analytics.abTests) {
      this.analytics.abTests = {};
    }
    
    if (!this.analytics.abTests[testId]) {
      this.analytics.abTests[testId] = {
        variantA: { total: 0, success: 0 },
        variantB: { total: 0, success: 0 }
      };
    }
    
    const test = this.analytics.abTests[testId];
    test[variant].total++;
    if (success) {
      test[variant].success++;
    }
    
    // Calculate statistical significance if enough data
    if (test.variantA.total > 30 && test.variantB.total > 30) {
      const rateA = test.variantA.success / test.variantA.total;
      const rateB = test.variantB.success / test.variantB.total;
      const winner = rateA > rateB ? 'variantA' : 'variantB';
      const improvement = Math.abs(rateA - rateB) * 100;
      
      console.log(`📊 A/B Test ${testId}: ${winner} wins with ${improvement.toFixed(1)}% improvement`);
    }
    
    await this.saveAnalytics();
  }

  /**
   * Save analytics to file
   */
  async saveAnalytics() {
    try {
      this.analytics.lastUpdated = new Date().toISOString();
      
      // Ensure directory exists
      const dir = path.dirname(this.analyticsFile);
      await fs.mkdir(dir, { recursive: true });
      
      // Save analytics
      await fs.writeFile(
        this.analyticsFile,
        JSON.stringify(this.analytics, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving analytics:', error);
    }
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary() {
    const summary = {
      totalConversations: this.analytics.totalConversations,
      averageQualificationRate: 0,
      topPerformingSource: null,
      averageResponseTime: 0,
      recommendations: []
    };
    
    // Calculate qualification rate
    let totalQualified = 0;
    let totalLeads = 0;
    Object.values(this.analytics.conversionsBySource || {}).forEach(source => {
      totalQualified += source.qualified;
      totalLeads += source.total;
    });
    
    if (totalLeads > 0) {
      summary.averageQualificationRate = (totalQualified / totalLeads * 100).toFixed(1);
    }
    
    // Find top source
    let topSource = null;
    let topRate = 0;
    Object.entries(this.analytics.conversionsBySource || {}).forEach(([source, data]) => {
      const rate = data.qualified / data.total;
      if (rate > topRate) {
        topRate = rate;
        topSource = source;
      }
    });
    summary.topPerformingSource = topSource;
    
    // Calculate average response time
    if (this.analytics.timeToResponseStats?.length > 0) {
      const avg = this.analytics.timeToResponseStats.reduce((a, b) => a + b, 0) / 
                  this.analytics.timeToResponseStats.length;
      summary.averageResponseTime = Math.round(avg / 1000); // Convert to seconds
    }
    
    // Generate recommendations
    if (summary.averageQualificationRate < 30) {
      summary.recommendations.push('Qualification rate is low - review opening messages');
    }
    
    if (summary.averageResponseTime > 300) {
      summary.recommendations.push('Response time is slow - consider faster follow-ups');
    }
    
    return summary;
  }
}

module.exports = new ConversationAnalytics();