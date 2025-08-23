/**
 * Enhanced ISA Prompts with Source-Specific Variations
 * Optimized for higher engagement and conversion
 */

const ENHANCED_ISA_PROMPTS = {
  // Source-specific initial outreach templates
  initialOutreachBySource: {
    'Zillow': [
      "Hi {name}! I saw you inquired about the {property} property on Zillow. Are you able to tour it this week?",
      "Hi {name}, noticed you were checking out homes on Zillow! What caught your eye about that property?",
      "Hey {name}! The Zillow property you liked is getting lots of interest. When were you hoping to see it?"
    ],
    'Realtor.com': [
      "Hi {name}! Thanks for your inquiry on Realtor.com. That's a great property! How soon are you looking to move?",
      "Hey {name}, I saw your Realtor.com inquiry! Are you looking for something move-in ready or open to updates?",
      "Hi {name}! Got your message from Realtor.com. What's most important to you in your next home?"
    ],
    'PPC': [
      "Hi {name}! Thanks for reaching out about buying a home. What areas are you considering?",
      "Hey {name}! Glad you found us. Are you looking to buy in the next few months?",
      "Hi {name}! Perfect timing to buy. What's your ideal timeline for finding a home?"
    ],
    'Direct Connect': [
      "Hi {name}! Thanks for contacting us. Are you looking to buy or sell?",
      "Hey {name}! I'm here to help with your real estate needs. What brings you to the market?",
      "Hi {name}! Great to connect. What kind of property are you looking for?"
    ],
    'Facebook': [
      "Hi {name}! Saw you're interested in real estate. Are you thinking of making a move soon?",
      "Hey {name}! Thanks for reaching out on Facebook. What neighborhoods are you considering?",
      "Hi {name}! Love connecting on social media. What's got you thinking about real estate?"
    ],
    'Website': [
      "Hi {name}! Welcome to {agency}. Which properties caught your attention?",
      "Hey {name}! Thanks for visiting our site. Are you just starting your search or ready to buy?",
      "Hi {name}! Noticed you browsing our listings. Any particular features you're looking for?"
    ],
    'Referral': [
      "Hi {name}! {referrer} said you might need help with real estate. How can I assist?",
      "Hey {name}! {referrer} spoke highly of you. Are you looking to buy or sell?",
      "Hi {name}! {referrer} mentioned you're in the market. What's your timeline?"
    ],
    'Default': [
      "Hi {name}! I'm Eugenia with {agency}. Are you looking to buy or sell a home?",
      "Hey {name}! Thanks for reaching out about real estate. What's your timeline for moving?",
      "Hi {name}! Great to connect. What kind of property are you looking for?"
    ]
  },

  // Engagement boosters for low-responding leads
  engagementBoosters: [
    "Quick question - are you still looking or did you find something?",
    "No pressure, but the market's really active right now. Still interested?",
    "I found some properties you might love. Want me to send them over?",
    "Rates just dropped a bit. Does that change your timeline at all?",
    "Just checking in - how's the home search going?",
    "Any questions I can help answer about the buying process?",
    "Would a virtual tour be helpful to save you time?"
  ],

  // Psychological trigger phrases
  psychologicalTriggers: {
    scarcity: [
      "getting multiple offers",
      "won't last long",
      "just came on market",
      "only one available",
      "moving quickly"
    ],
    socialProof: [
      "other buyers are interested",
      "just helped another family",
      "clients love this area",
      "everyone's looking at",
      "popular neighborhood"
    ],
    urgency: [
      "this week",
      "while it's available",
      "before it's gone",
      "limited time",
      "act fast"
    ],
    value: [
      "great deal",
      "priced to sell",
      "below market",
      "excellent value",
      "rare find"
    ],
    trust: [
      "I'll be honest",
      "in my experience",
      "I've helped many",
      "you can trust",
      "I understand"
    ]
  },

  // Qualification question variations
  qualificationVariations: {
    timeline: [
      "When are you hoping to move?",
      "What's your ideal timeline?",
      "How soon do you need to find something?",
      "Are you looking for this year or next?",
      "Is this a now thing or planning ahead?"
    ],
    agentStatus: [
      "Are you working with an agent yet?",
      "Do you have someone helping you look?",
      "Have you connected with a realtor?",
      "Is anyone assisting with your search?",
      "Do you have representation?"
    ],
    financing: [
      "Have you talked to a lender yet?",
      "Are you pre-approved or paying cash?",
      "How's the financing side going?",
      "Have you figured out your budget?",
      "Do you know your price range?"
    ],
    motivation: [
      "What's bringing you to the market?",
      "What's motivating your move?",
      "Why are you looking to move?",
      "What's the reason for house hunting?",
      "What's driving your search?"
    ]
  },

  // Objection handlers with empathy
  objectionResponses: {
    'just looking': "That's smart! It's good to know what's out there. Anything specific you're watching for?",
    'not ready': "No rush at all! When you are ready, what would your dream home look like?",
    'already have agent': "That's great! Best of luck with your search. If you need anything, I'm here.",
    'too expensive': "I totally understand. What price range would work better for your budget?",
    'bad timing': "Timing is everything! When do you think would work better for you?",
    'not interested': "No problem at all! Feel free to reach out if anything changes. Have a great day!",
    'stop texting': "I apologize for the texts. I'll remove you from our list right away.",
    'is this real': "Yes! I'm Eugenia, a real person helping {agent} connect with clients. How can I help?"
  },

  // Conversation continuers based on context
  contextualFollowUps: {
    afterTimeline: "Great! And are you already working with an agent?",
    afterAgent: "Perfect! Have you been pre-approved or are you planning to pay cash?",
    afterFinancing: "Excellent! What areas are you most interested in?",
    afterLocation: "Nice area! What size home are you looking for?",
    afterSize: "Got it! When would you like to schedule a tour?",
    afterInterest: "I can definitely help with that! When works best for a quick call?",
    afterQuestion: "Great question! {agent} can explain that better. Should they call you today?"
  },

  // Closing techniques
  closingStatements: {
    soft: "Would you like to see some options that match what you're looking for?",
    medium: "How about we schedule a quick call to discuss your needs?",
    hard: "{agent} has some time this afternoon. Would 2pm or 4pm work better?",
    assumptive: "I'll have {agent} call you shortly to set up some showings.",
    choice: "Would you prefer to tour homes this weekend or during the week?",
    urgency: "This market moves fast. Should we look at properties today or tomorrow?",
    value: "I found 3 homes in your range. Want me to send them over?"
  }
};

// Advanced escalation detection
const ADVANCED_ESCALATION_PATTERNS = {
  // High-intent phrases that indicate readiness
  highIntent: [
    /ready to (buy|purchase|move)/i,
    /need to (buy|find|move)/i,
    /want to (see|tour|view)/i,
    /can we (see|tour|schedule)/i,
    /when can (i|we) (see|tour)/i,
    /interested in (seeing|touring)/i,
    /make an offer/i,
    /put in an offer/i,
    /submit an offer/i
  ],

  // Complex questions requiring expertise
  expertiseRequired: [
    /how much can i afford/i,
    /closing cost/i,
    /commission/i,
    /inspection/i,
    /contingenc/i,
    /earnest money/i,
    /escrow/i,
    /title insurance/i,
    /property tax/i,
    /hoa fee/i,
    /mortgage rate/i,
    /down payment/i,
    /credit score/i,
    /fha.+loan/i,
    /va.+loan/i
  ],

  // Emotional or urgent situations
  emotionalTriggers: [
    /divorce/i,
    /death in family/i,
    /lost.+job/i,
    /emergency/i,
    /urgent/i,
    /asap/i,
    /immediately/i,
    /right away/i,
    /today/i,
    /tonight/i,
    /tomorrow/i
  ]
};

// Response timing recommendations
const RESPONSE_TIMING = {
  immediate: {
    maxDelay: 60, // seconds
    triggers: ['just listed', 'tour today', 'available now', 'asap', 'urgent']
  },
  quick: {
    maxDelay: 300, // 5 minutes
    triggers: ['interested', 'questions', 'more info', 'tell me']
  },
  standard: {
    maxDelay: 900, // 15 minutes
    triggers: ['looking', 'considering', 'thinking about']
  },
  patient: {
    maxDelay: 3600, // 1 hour
    triggers: ['maybe', 'not sure', 'just browsing', 'future']
  }
};

module.exports = {
  ENHANCED_ISA_PROMPTS,
  ADVANCED_ESCALATION_PATTERNS,
  RESPONSE_TIMING
};