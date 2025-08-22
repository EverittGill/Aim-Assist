/**
 * Qualification Service for Lead Tracking
 * Tracks key qualifying information and determines when a lead is ready for human handoff
 */

const { supabase } = require('../config/supabase');

class QualificationService {
  constructor(tenantId) {
    this.tenantId = tenantId;
    
    // Key qualification fields to track
    this.qualificationFields = {
      timeline: {
        question: 'When are you looking to move/buy?',
        keywords: ['month', 'weeks', 'asap', 'immediately', 'christmas', 'year', 'spring', 'summer', 'fall', 'winter'],
        priority: 1
      },
      budget: {
        question: 'What\'s your budget range?',
        keywords: ['$', 'k', 'hundred', 'thousand', 'million', 'budget', 'afford', 'price'],
        priority: 2
      },
      financing: {
        question: 'Are you pre-approved or paying cash?',
        keywords: ['pre-approved', 'preapproved', 'cash', 'loan', 'mortgage', 'financing', 'bank', 'lender'],
        priority: 3
      },
      agentStatus: {
        question: 'Are you already working with an agent?',
        keywords: ['agent', 'realtor', 'broker', 'working with', 'represented'],
        priority: 4
      },
      location: {
        question: 'What areas are you interested in?',
        keywords: ['area', 'location', 'neighborhood', 'school', 'district', 'zip', 'city'],
        priority: 5
      }
    };
    
    // Escalation triggers
    this.escalationTriggers = {
      scheduleRequest: ['schedule', 'appointment', 'showing', 'tour', 'visit', 'meet', 'see the', 'view', 'book a time', 'set up a time'],
      phoneRequest: ['call me', 'phone', 'talk', 'speak', 'number', 'reach me', 'can he call', 'can she call', 'have them call'],
      urgentTimeline: ['asap', 'immediately', 'today', 'tomorrow', 'urgent', 'right away'],
      highBudget: ['million', '1m', '2m', '500k', '750k'], // Adjust based on market
      pauseRequest: ['go to bed', 'sleep', 'goodnight', 'good night', 'cant talk', "can't talk", 'later', 'busy']
    };
  }

  /**
   * Analyze a conversation to extract qualification data
   */
  async analyzeConversation(messages, leadContext = {}) {
    const qualification = {
      timeline: null,
      budget: null,
      financing: null,
      agentStatus: null,
      location: null,
      phoneInterest: false,
      schedulingInterest: false,
      urgentNeed: false,
      highValue: false,
      pauseRequested: false,
      qualificationScore: 0,
      isQualified: false,
      missingFields: [],
      completedFields: [],
      nextQuestion: null,
      escalationReason: null
    };

    // Analyze each message for qualification data
    for (const message of messages) {
      // Only analyze lead messages (inbound)
      if (message.direction === 'inbound' || message.sender_type === 'lead') {
        const content = (message.content || message.text || '').toLowerCase();
        
        // Check each qualification field
        for (const [field, config] of Object.entries(this.qualificationFields)) {
          if (!qualification[field] && this.containsKeywords(content, config.keywords)) {
            qualification[field] = this.extractValue(content, field);
            qualification.completedFields.push(field);
          }
        }
        
        // Check for escalation triggers
        if (this.containsKeywords(content, this.escalationTriggers.scheduleRequest)) {
          qualification.schedulingInterest = true;
        }
        if (this.containsKeywords(content, this.escalationTriggers.phoneRequest)) {
          qualification.phoneInterest = true;
        }
        if (this.containsKeywords(content, this.escalationTriggers.urgentTimeline)) {
          qualification.urgentNeed = true;
        }
        if (this.containsKeywords(content, this.escalationTriggers.highBudget)) {
          qualification.highValue = true;
        }
        if (this.containsKeywords(content, this.escalationTriggers.pauseRequest)) {
          qualification.pauseRequested = true;
        }
      }
    }
    
    // Add context from lead profile if available
    if (leadContext.timeline) qualification.timeline = leadContext.timeline;
    if (leadContext.budget) qualification.budget = leadContext.budget;
    if (leadContext.location) qualification.location = leadContext.location;
    
    // Determine missing fields
    for (const field of Object.keys(this.qualificationFields)) {
      if (!qualification[field]) {
        qualification.missingFields.push(field);
      }
    }
    
    // Calculate qualification score
    qualification.qualificationScore = this.calculateScore(qualification);
    
    // Determine if qualified
    qualification.isQualified = this.isLeadQualified(qualification);
    
    // Determine next question to ask
    qualification.nextQuestion = this.getNextQuestion(qualification);
    
    // Determine escalation reason
    qualification.escalationReason = this.getEscalationReason(qualification);
    
    return qualification;
  }

  /**
   * Check if content contains any keywords
   */
  containsKeywords(content, keywords) {
    const lowerContent = content.toLowerCase();
    return keywords.some(keyword => lowerContent.includes(keyword.toLowerCase()));
  }

  /**
   * Extract value from message content based on field type
   */
  extractValue(content, field) {
    const lowerContent = content.toLowerCase();
    
    switch (field) {
      case 'timeline':
        // Extract timeline mentions
        if (lowerContent.includes('asap') || lowerContent.includes('immediately')) {
          return 'ASAP';
        }
        if (lowerContent.includes('christmas')) {
          return 'By Christmas';
        }
        if (lowerContent.includes('month')) {
          const match = content.match(/(\d+)\s*month/i);
          return match ? `${match[1]} months` : 'Within months';
        }
        if (lowerContent.includes('year')) {
          return 'Within a year';
        }
        return 'Timeline mentioned';
        
      case 'budget':
        // Extract budget amounts
        const moneyMatch = content.match(/\$?([\d,]+)k?m?/i);
        if (moneyMatch) {
          let amount = moneyMatch[1].replace(/,/g, '');
          if (lowerContent.includes('k')) amount += '000';
          if (lowerContent.includes('m')) amount += '000000';
          return `$${parseInt(amount).toLocaleString()}`;
        }
        return 'Budget mentioned';
        
      case 'financing':
        if (lowerContent.includes('cash')) return 'Cash';
        if (lowerContent.includes('pre-approved') || lowerContent.includes('preapproved')) {
          return 'Pre-approved';
        }
        if (lowerContent.includes('working with') && lowerContent.includes('lender')) {
          return 'Working with lender';
        }
        return 'Financing mentioned';
        
      case 'agentStatus':
        if (lowerContent.includes('no') && lowerContent.includes('agent')) return 'No agent';
        if (lowerContent.includes('yes') && lowerContent.includes('agent')) return 'Has agent';
        if (lowerContent.includes('working with')) return 'Has agent';
        return 'Agent status mentioned';
        
      case 'location':
        // Extract location names (simplified - could be enhanced)
        return content.trim();
        
      default:
        return 'Mentioned';
    }
  }

  /**
   * Calculate qualification score
   */
  calculateScore(qualification) {
    let score = 0;
    const weights = {
      timeline: 25,
      budget: 25,
      financing: 20,
      agentStatus: 15,
      location: 15,
      phoneInterest: 10,
      schedulingInterest: 15,
      urgentNeed: 10,
      highValue: 10
    };
    
    for (const [field, weight] of Object.entries(weights)) {
      if (qualification[field]) {
        score += weight;
      }
    }
    
    return Math.min(score, 100);
  }

  /**
   * Determine if lead is qualified
   */
  isLeadQualified(qualification) {
    // Qualified if:
    // 1. Has timeline, budget, and financing info
    // 2. OR wants to schedule/call
    // 3. OR has urgent need with any 2 fields
    // 4. OR score >= 70
    
    const hasCore = qualification.timeline && qualification.budget && qualification.financing;
    const wantsContact = qualification.phoneInterest || qualification.schedulingInterest;
    const isUrgent = qualification.urgentNeed && qualification.completedFields.length >= 2;
    const highScore = qualification.qualificationScore >= 70;
    
    return hasCore || wantsContact || isUrgent || highScore;
  }

  /**
   * Get the next question to ask
   */
  getNextQuestion(qualification) {
    // Priority order for questions
    const priority = ['timeline', 'budget', 'financing', 'agentStatus', 'location'];
    
    for (const field of priority) {
      if (!qualification[field]) {
        return this.qualificationFields[field].question;
      }
    }
    
    // All fields complete
    return null;
  }

  /**
   * Get escalation reason
   */
  getEscalationReason(qualification) {
    if (qualification.schedulingInterest) return 'Lead wants to schedule showing';
    if (qualification.phoneInterest) return 'Lead requested phone call';
    if (qualification.urgentNeed && qualification.isQualified) return 'Urgent qualified lead';
    if (qualification.highValue && qualification.isQualified) return 'High-value qualified lead';
    if (qualification.isQualified) return 'Lead is qualified';
    return null;
  }

  /**
   * Save qualification status to database
   */
  async saveQualification(leadId, qualification) {
    try {
      const { data, error } = await supabase
        .from('lead_qualifications')
        .upsert({
          tenant_id: this.tenantId,
          lead_id: leadId,
          timeline: qualification.timeline,
          budget: qualification.budget,
          financing: qualification.financing,
          agent_status: qualification.agentStatus,
          location: qualification.location,
          qualification_score: qualification.qualificationScore,
          is_qualified: qualification.isQualified,
          escalation_reason: qualification.escalationReason,
          qualified_at: qualification.isQualified ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id,lead_id'
        });

      if (error) {
        console.warn('⚠️ Failed to save qualification:', error.message);
        return null;
      }

      console.log(`✅ Qualification saved for lead ${leadId}: Score ${qualification.qualificationScore}`);
      return data;
    } catch (error) {
      console.error('Error saving qualification:', error);
      return null;
    }
  }

  /**
   * Get qualification status for a lead
   */
  async getQualification(leadId) {
    try {
      const { data, error } = await supabase
        .from('lead_qualifications')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('lead_id', leadId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No qualification record yet
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error getting qualification:', error);
      return null;
    }
  }

  /**
   * Generate a follow-up message when lead is qualified
   */
  generateQualificationFollowUp(qualification, agentName = 'our team') {
    if (qualification.phoneInterest) {
      return `Perfect! ${agentName} will give you a call shortly to discuss your real estate needs. Looking forward to helping you!`;
    }
    
    if (qualification.schedulingInterest) {
      return `Excellent! ${agentName} will reach out to schedule a showing for you. They'll be in touch very soon!`;
    }
    
    if (qualification.urgentNeed) {
      return `I understand this is urgent. ${agentName} will contact you right away to help with your immediate needs.`;
    }
    
    return `Thanks for all that information! ${agentName} will be reaching out shortly to assist you further.`;
  }
}

module.exports = QualificationService;