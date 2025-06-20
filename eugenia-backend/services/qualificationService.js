const fubService = require('./fubService');
const twilioService = require('./twilioService');

class QualificationService {
  constructor() {
    // Define the qualifying questions we're tracking
    this.qualifyingQuestions = {
      timeline: {
        keywords: ['timeline', 'when', 'how soon', 'move', 'moving', 'buy', 'purchase', 'timeframe'],
        answered: false,
        response: null
      },
      agentStatus: {
        keywords: ['agent', 'realtor', 'working with', 'have an agent', 'represented'],
        answered: false,
        response: null
      },
      financing: {
        keywords: ['financing', 'pre-approved', 'preapproved', 'cash', 'loan', 'mortgage', 'lender'],
        answered: false,
        response: null
      }
    };

    // Keywords that indicate phone interest
    this.phoneInterestKeywords = [
      'call me', 'phone call', 'can you call', 'give me a call',
      'speak to', 'talk to', 'rather talk', 'prefer to talk',
      'phone number', 'number to call', 'best number'
    ];

    // Keywords that indicate scheduling interest
    this.schedulingKeywords = [
      'schedule', 'appointment', 'meet', 'showing', 'view',
      'tour', 'see the', 'visit', 'available to show',
      'when can i', 'can we meet', 'set up a time'
    ];
  }

  /**
   * Analyze a conversation to track qualification progress
   * @param {Array} messages - Array of conversation messages
   * @returns {Object} Qualification status
   */
  analyzeQualificationStatus(messages) {
    const status = {
      qualifyingQuestions: JSON.parse(JSON.stringify(this.qualifyingQuestions)),
      phoneInterestDetected: false,
      schedulingInterestDetected: false,
      qualificationComplete: false,
      shouldNotifyAgent: false,
      reasons: []
    };

    // Analyze each message for qualifying information
    messages.forEach(message => {
      if (message.direction === 'inbound') {
        // Handle different field names from different sources
        const messageContent = message.content || message.text || message.body || '';
        const lowerContent = messageContent.toLowerCase();

        // Check for qualifying question answers
        Object.keys(status.qualifyingQuestions).forEach(key => {
          const question = status.qualifyingQuestions[key];
          if (!question.answered) {
            const hasAnswer = question.keywords.some(keyword => 
              lowerContent.includes(keyword)
            );
            if (hasAnswer) {
              question.answered = true;
              question.response = messageContent;
            }
          }
        });

        // Check for phone interest
        if (!status.phoneInterestDetected) {
          status.phoneInterestDetected = this.phoneInterestKeywords.some(keyword =>
            lowerContent.includes(keyword)
          );
        }

        // Check for scheduling interest
        if (!status.schedulingInterestDetected) {
          status.schedulingInterestDetected = this.schedulingKeywords.some(keyword =>
            lowerContent.includes(keyword)
          );
        }
      }
    });

    // Determine if qualification is complete
    const answeredCount = Object.values(status.qualifyingQuestions)
      .filter(q => q.answered).length;
    const totalQuestions = Object.keys(status.qualifyingQuestions).length;

    // Complete if all questions answered OR if they show phone/scheduling interest
    status.qualificationComplete = answeredCount === totalQuestions || 
                                  status.phoneInterestDetected || 
                                  status.schedulingInterestDetected;

    // Determine if agent should be notified
    if (status.phoneInterestDetected) {
      status.shouldNotifyAgent = true;
      status.reasons.push('Lead expressed interest in a phone call');
    }
    
    if (status.schedulingInterestDetected) {
      status.shouldNotifyAgent = true;
      status.reasons.push('Lead wants to schedule a showing or meeting');
    }
    
    if (answeredCount === totalQuestions) {
      status.shouldNotifyAgent = true;
      status.reasons.push('Lead answered all qualifying questions');
    }
    
    // Check for partial qualification with high engagement
    if (answeredCount >= 2 && messages.filter(m => m.direction === 'inbound').length >= 4) {
      status.shouldNotifyAgent = true;
      status.reasons.push(`Lead is highly engaged (answered ${answeredCount}/${totalQuestions} qualifying questions)`);
    }

    return status;
  }

  /**
   * Generate Eugenia's follow-up message when qualification is complete
   * @param {Object} leadDetails - Lead information
   * @param {Object} qualificationStatus - Qualification status
   * @returns {String} Follow-up message
   */
  generateQualificationFollowUp(leadDetails, qualificationStatus) {
    const firstName = leadDetails.firstName || 'there';
    
    if (qualificationStatus.phoneInterestDetected) {
      return `Perfect ${firstName}! Everitt will give you a call shortly. He's great at finding exactly what you're looking for. Talk soon!`;
    }
    
    if (qualificationStatus.schedulingInterestDetected) {
      return `Excellent ${firstName}! Everitt will reach out to schedule that for you. He knows the market inside and out. He'll call you soon!`;
    }
    
    // Default for completed qualifying questions
    return `Thanks for all that info ${firstName}! Everitt will be calling you shortly to discuss your real estate needs in detail. Looking forward to helping you!`;
  }

  /**
   * Send notification to agent when qualification is complete
   * @param {Object} leadDetails - Lead information
   * @param {Object} qualificationStatus - Qualification status
   */
  async notifyAgentForQualification(leadDetails, qualificationStatus) {
    const userPhone = process.env.USER_NOTIFICATION_PHONE;
    
    if (!userPhone) {
      console.log('⚠️ USER_NOTIFICATION_PHONE not configured, skipping agent notification');
      return false;
    }

    try {
      // Build notification message
      let message = `🎯 QUALIFIED LEAD ALERT!\n\n`;
      message += `${leadDetails.firstName} ${leadDetails.lastName} is ready for your call!\n`;
      message += `Phone: ${leadDetails.phones?.[0]?.number || 'Check FUB'}\n\n`;
      
      // Add specific reason
      if (qualificationStatus.phoneInterestDetected) {
        message += `📞 They specifically asked for a phone call\n`;
      }
      if (qualificationStatus.schedulingInterestDetected) {
        message += `📅 They want to schedule a showing/meeting\n`;
      }
      
      // Add qualification summary
      const answered = Object.entries(qualificationStatus.qualifyingQuestions)
        .filter(([_, q]) => q.answered)
        .map(([key, _]) => key);
      
      if (answered.length > 0) {
        message += `\n✅ Answered: ${answered.join(', ')}\n`;
      }
      
      message += `\nLead ID: ${leadDetails.id}`;

      // Send SMS notification using Twilio service
      await twilioService.queueSMS(userPhone, message, {
        isNotification: true,
        priority: 0, // Highest priority for agent notifications
        delay: 0 // Send immediately
      });

      console.log('📱 Queued qualification notification to agent:', userPhone);
      return true;
    } catch (error) {
      console.error('❌ Error sending qualification notification:', error);
      return false;
    }
  }

  /**
   * Store qualification status in FUB custom fields
   * @param {String} leadId - Lead ID
   * @param {Object} status - Qualification status object
   */
  async updateQualificationStatus(leadId, status) {
    try {
      // Prepare custom field updates
      const customFields = {
        customQualificationStatus: status.qualificationComplete ? 'qualified' : 'in_progress',
        customPhoneInterest: status.phoneInterestDetected ? 'yes' : 'no',
        customSchedulingInterest: status.schedulingInterestDetected ? 'yes' : 'no',
        customQualifyingAnswers: JSON.stringify({
          timeline: status.qualifyingQuestions.timeline.answered,
          agentStatus: status.qualifyingQuestions.agentStatus.answered,
          financing: status.qualifyingQuestions.financing.answered
        })
      };

      // Add notification reason if agent should be notified
      if (status.shouldNotifyAgent && status.reasons.length > 0) {
        customFields.customNotificationReason = status.reasons.join('; ');
      }

      // Update lead in FUB
      await fubService.updateLead(leadId, customFields);
      
      console.log('📊 Qualification status updated for lead', leadId, {
        complete: status.qualificationComplete,
        phoneInterest: status.phoneInterestDetected,
        schedulingInterest: status.schedulingInterestDetected,
        answeredQuestions: Object.entries(status.qualifyingQuestions)
          .filter(([_, q]) => q.answered)
          .map(([key, _]) => key)
      });

      return true;
    } catch (error) {
      console.error('❌ Error updating qualification status:', error);
      return false;
    }
  }

  /**
   * Check if a lead should be paused based on qualification
   * @param {Object} qualificationStatus - Result from analyzeQualificationStatus
   * @returns {Boolean} Whether to pause AI responses
   */
  shouldPauseForQualification(qualificationStatus) {
    return qualificationStatus.shouldNotifyAgent;
  }

  /**
   * Get a summary of qualification progress for logging
   * @param {Object} status - Qualification status object
   * @returns {String} Human-readable summary
   */
  getQualificationSummary(status) {
    const answeredQuestions = Object.entries(status.qualifyingQuestions)
      .filter(([_, q]) => q.answered)
      .map(([key, _]) => key);
    
    const totalAnswered = answeredQuestions.length;
    const total = Object.keys(status.qualifyingQuestions).length;
    
    let summary = `Qualification Progress: ${totalAnswered}/${total} questions answered`;
    
    if (answeredQuestions.length > 0) {
      summary += ` (${answeredQuestions.join(', ')})`;
    }
    
    if (status.phoneInterestDetected) {
      summary += ' | 📞 Phone interest detected';
    }
    
    if (status.schedulingInterestDetected) {
      summary += ' | 📅 Scheduling interest detected';
    }
    
    return summary;
  }
}

module.exports = new QualificationService();