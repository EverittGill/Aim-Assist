# GROWTH_IDEAS.md - Advanced Extraction & System Improvements

## Context for Future Reference

This document was created on January 21, 2025, during the development of the Aim Assist SaaS intelligent lead extraction system. At this point:

- **Current State**: Building multi-tenant SaaS version of Eugenia ISA
- **Core Challenge**: Extracting structured data from conversational SMS messages
- **Baseline Approach**: Single-pass Claude extraction with regex fallback (80% success rate)
- **Goal**: Achieve 95%+ extraction accuracy for production reliability

The ideas in this document are intended for implementation AFTER the MVP is working and we have real usage data to validate these improvements against.

---

## 🎯 Extraction Improvements: 80% → 95%+ Success Rate

### 1. Two-Pass Extraction System (10% Improvement)

**Concept**: First classify the intent, then use specialized extractors

**Why It Works**: Classification is 99% accurate, and specialized extractors are more focused

```javascript
class TwoPassExtractor {
  constructor() {
    this.intents = {
      'providing_timeline': TimelineExtractor,
      'discussing_budget': BudgetExtractor,
      'answering_qualification': QualificationExtractor,
      'requesting_human': EscalationExtractor,
      'general_inquiry': GeneralExtractor
    };
  }

  async extract(message, context) {
    // Pass 1: Intent Classification (99% accurate)
    const intent = await this.classifyIntent(message);
    
    // Pass 2: Specialized Extraction
    const ExtractorClass = this.intents[intent];
    const extractor = new ExtractorClass();
    return await extractor.extract(message, context);
  }
  
  async classifyIntent(message) {
    const prompt = `
      Classify this real estate message into ONE category:
      - providing_timeline (when to move/buy)
      - discussing_budget (price, financing, affordability)
      - answering_qualification (agent status, pre-approval)
      - requesting_human (wants call, meeting, human)
      - general_inquiry (other questions or info)
      
      Message: "${message}"
      
      Respond with only the category name.
    `;
    
    return await claude.generate(prompt);
  }
}

// Example specialized extractor
class TimelineExtractor {
  async extract(message, context) {
    const prompt = `
      Extract ONLY timeline information from this message.
      Look for: specific dates, relative timeframes, urgency indicators.
      
      Message: "${message}"
      
      Examples of good extraction:
      "in 3 months" → { timeline: "3 months", confidence: 0.95 }
      "next spring" → { timeline: "spring 2025", confidence: 0.85 }
      "ASAP" → { timeline: "immediate", confidence: 0.9 }
      
      Return JSON with timeline and confidence (0-1).
      If no timeline mentioned, return { timeline: null, confidence: 0 }
    `;
    
    return await claude.generate(prompt);
  }
}
```

**Implementation Time**: 2 hours
**Risk**: Low - can run in parallel with existing extraction
**When to Implement**: After 100+ real messages processed

---

### 2. Pattern Library with Few-Shot Learning (8% Improvement)

**Concept**: Build a library of successful extractions and use them as examples

**Why It Works**: LLMs perform better with concrete examples than abstract instructions

```javascript
class PatternLibrary {
  constructor() {
    this.patterns = new Map();
    this.loadFromDatabase();
  }
  
  async addPattern(input, output, verified = false) {
    const pattern = {
      id: generateId(),
      input,
      output,
      verified,
      timestamp: new Date(),
      useCount: 0,
      successRate: verified ? 1.0 : 0.5
    };
    
    this.patterns.set(pattern.id, pattern);
    await this.saveToDatabase();
  }
  
  getSimilarPatterns(message, type, limit = 3) {
    // Use embedding similarity or keyword matching
    const allPatterns = Array.from(this.patterns.values())
      .filter(p => p.output.type === type);
    
    // Simple keyword similarity (upgrade to embeddings later)
    const scored = allPatterns.map(pattern => ({
      pattern,
      score: this.calculateSimilarity(message, pattern.input)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.pattern);
  }
  
  calculateSimilarity(text1, text2) {
    // Simple Jaccard similarity (upgrade to better algorithm)
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }
  
  async updatePatternSuccess(patternId, wasSuccessful) {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.useCount++;
      pattern.successRate = 
        (pattern.successRate * (pattern.useCount - 1) + (wasSuccessful ? 1 : 0)) 
        / pattern.useCount;
      await this.saveToDatabase();
    }
  }
}

// Usage in extraction
class PatternAugmentedExtractor {
  constructor() {
    this.library = new PatternLibrary();
  }
  
  async extract(message, type) {
    const examples = this.library.getSimilarPatterns(message, type);
    
    if (examples.length === 0) {
      return this.basicExtraction(message);
    }
    
    const prompt = `
      Learn from these examples to extract ${type}:
      
      ${examples.map((ex, i) => `
      Example ${i + 1}:
      Input: "${ex.input}"
      Output: ${JSON.stringify(ex.output)}
      Success Rate: ${(ex.successRate * 100).toFixed(0)}%
      `).join('\n')}
      
      Now extract from: "${message}"
      
      Follow the pattern of the examples with highest success rate.
      Return JSON in the same format.
    `;
    
    const result = await claude.generate(prompt);
    
    // Track this extraction as a new pattern
    await this.library.addPattern(message, result, false);
    
    return result;
  }
}
```

**Implementation Time**: 3 hours
**Risk**: Medium - requires pattern storage and retrieval system
**When to Implement**: After 500+ messages to build initial library

---

### 3. Confidence Calibration with Verification Loop (5% Improvement)

**Concept**: Double-check extractions and self-correct errors

**Why It Works**: Catches obvious mistakes and improves confidence scoring

```javascript
class VerifiedExtractor {
  async extractWithVerification(message, context) {
    // Step 1: Initial extraction
    let extraction = await this.extract(message);
    
    // Step 2: Verify extraction makes sense
    const verification = await this.verify(extraction, message, context);
    
    if (verification.isValid) {
      // Boost confidence for verified extractions
      extraction.confidence = Math.min(1.0, extraction.confidence * 1.2);
      extraction.verified = true;
      return extraction;
    }
    
    // Step 3: Self-correct based on verification feedback
    extraction = await this.correctExtraction(
      message, 
      extraction, 
      verification.issues
    );
    
    // Step 4: Final verification
    const finalCheck = await this.verify(extraction, message, context);
    extraction.verified = finalCheck.isValid;
    extraction.verificationAttempts = 2;
    
    return extraction;
  }
  
  async verify(extraction, originalMessage, context) {
    const prompt = `
      Verify this extraction is correct and logical:
      
      Original message: "${originalMessage}"
      Extraction: ${JSON.stringify(extraction)}
      Known context: ${JSON.stringify(context.knownInfo)}
      
      Check these rules:
      1. Timeline makes sense (not "3 years" for urgent, not "tomorrow" for planning)
      2. Budget is realistic ($50k-$5M for residential)
      3. No contradictions with known information
      4. Agent status matches message sentiment
      5. Escalation reasons are valid
      
      Return JSON:
      {
        "isValid": boolean,
        "confidence": 0-1,
        "issues": ["issue1", "issue2"],
        "suggestions": {"field": "suggested_value"}
      }
    `;
    
    return await claude.generate(prompt);
  }
  
  async correctExtraction(message, extraction, issues) {
    const prompt = `
      Fix these extraction errors:
      
      Message: "${message}"
      Current extraction: ${JSON.stringify(extraction)}
      Issues found: ${JSON.stringify(issues)}
      
      Provide corrected extraction that addresses all issues.
      Be more conservative with confidence scores.
      
      Return corrected JSON.
    `;
    
    const corrected = await claude.generate(prompt);
    corrected.wasCorrected = true;
    corrected.originalExtraction = extraction;
    
    return corrected;
  }
}
```

**Implementation Time**: 2 hours
**Risk**: Low - adds safety without breaking existing flow
**When to Implement**: After core extraction is stable

---

### 4. Hybrid Extraction Pipeline (2% Improvement)

**Concept**: Run multiple extraction methods in parallel and merge results

**Why It Works**: Different methods excel at different types of extraction

```javascript
class HybridExtractor {
  constructor() {
    this.extractors = [
      { name: 'claude', weight: 0.5, fn: this.claudeExtract },
      { name: 'regex', weight: 0.3, fn: this.regexExtract },
      { name: 'nlp', weight: 0.2, fn: this.nlpExtract }
    ];
  }
  
  async extract(message, context) {
    // Run all extractors in parallel
    const results = await Promise.allSettled(
      this.extractors.map(async ext => ({
        name: ext.name,
        weight: ext.weight,
        result: await ext.fn(message, context)
      }))
    );
    
    // Filter successful extractions
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    // Merge with weighted confidence
    return this.mergeResults(successful);
  }
  
  mergeResults(results) {
    const merged = {};
    const fields = ['timeline', 'budget', 'hasAgent', 'shouldPause'];
    
    for (const field of fields) {
      const fieldResults = results
        .filter(r => r.result && r.result[field] !== undefined)
        .map(r => ({
          value: r.result[field],
          confidence: (r.result[`${field}Confidence`] || 0.5) * r.weight,
          source: r.name
        }));
      
      if (fieldResults.length === 0) continue;
      
      // Sort by weighted confidence
      fieldResults.sort((a, b) => b.confidence - a.confidence);
      
      // Check for agreement
      const topValue = fieldResults[0].value;
      const agreementCount = fieldResults.filter(r => r.value === topValue).length;
      
      if (agreementCount > 1) {
        // Multiple extractors agree - boost confidence
        merged[field] = topValue;
        merged[`${field}Confidence`] = Math.min(
          1.0,
          fieldResults[0].confidence * (1 + 0.1 * agreementCount)
        );
        merged[`${field}Sources`] = fieldResults
          .filter(r => r.value === topValue)
          .map(r => r.source);
      } else {
        // Use highest confidence result
        merged[field] = fieldResults[0].value;
        merged[`${field}Confidence`] = fieldResults[0].confidence;
        merged[`${field}Source`] = fieldResults[0].source;
      }
    }
    
    // Calculate overall confidence
    const confidences = fields
      .map(f => merged[`${f}Confidence`] || 0)
      .filter(c => c > 0);
    
    merged.overallConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b) / confidences.length
      : 0;
    
    return merged;
  }
  
  async regexExtract(message) {
    // High-precision patterns
    const patterns = {
      timeline: {
        immediate: /\b(asap|urgent|immediately|right away|today|tomorrow)\b/i,
        months: /\b(\d+)\s*months?\b/i,
        seasonal: /\b(spring|summer|fall|winter|january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?\b/i
      },
      budget: {
        thousands: /\$?(\d{1,3}),?(\d{3})\b/,
        shorthand: /\$?(\d+)k\b/i,
        millions: /\$?(\d+\.?\d*)\s*m(?:illion)?\b/i
      },
      hasAgent: {
        yes: /\b(have|got|using|working with)\s+(an?\s+)?(agent|realtor|broker)\b/i,
        no: /\b(don't|dont|no|need|looking for)\s+(have\s+)?(an?\s+)?(agent|realtor|broker)\b/i
      }
    };
    
    const extraction = {};
    
    // Extract with patterns
    for (const [field, fieldPatterns] of Object.entries(patterns)) {
      for (const [type, pattern] of Object.entries(fieldPatterns)) {
        const match = message.match(pattern);
        if (match) {
          extraction[field] = this.parseMatch(field, type, match);
          extraction[`${field}Confidence`] = 0.8; // Regex is confident when it matches
          break;
        }
      }
    }
    
    return extraction;
  }
}
```

**Implementation Time**: 2 hours
**Risk**: Medium - complexity in merging logic
**When to Implement**: After individual extractors are optimized

---

## 🚀 Quick Wins for Immediate Improvement

### 1. Message Preprocessing (3% Improvement, 30 mins)

```javascript
class MessagePreprocessor {
  static normalize(message) {
    // Fix common shortcuts
    const shortcuts = {
      'k': '000',
      'mil': 'million',
      'asap': 'as soon as possible',
      'apt': 'apartment',
      'br': 'bedroom',
      'ba': 'bathroom',
      'sqft': 'square feet',
      'hoa': 'HOA'
    };
    
    let normalized = message.toLowerCase();
    
    // Apply shortcuts with word boundaries
    for (const [short, full] of Object.entries(shortcuts)) {
      normalized = normalized.replace(
        new RegExp(`\\b${short}\\b`, 'gi'),
        full
      );
    }
    
    // Fix common typos
    const typos = {
      'morgage': 'mortgage',
      'realator': 'realtor',
      'appartment': 'apartment',
      'buget': 'budget',
      'intrested': 'interested',
      'definately': 'definitely'
    };
    
    for (const [typo, correct] of Object.entries(typos)) {
      normalized = normalized.replace(
        new RegExp(typo, 'gi'),
        correct
      );
    }
    
    // Normalize number formats
    normalized = normalized
      .replace(/(\d),(\d{3})/g, '$1$2') // Remove commas from numbers
      .replace(/\$\s+(\d)/g, '$$$1'); // Fix spaced dollar signs
    
    return normalized;
  }
}
```

### 2. Prompt Engineering Templates (5% Improvement, 1 hour)

```javascript
class PromptTemplates {
  static getExtractionPrompt(type, message, context = {}) {
    const templates = {
      timeline: `
        You are extracting move-in timeline from a real estate lead message.
        
        Context:
        - Current date: ${new Date().toLocaleDateString()}
        - Lead source: ${context.source || 'unknown'}
        - Previous timeline mentioned: ${context.previousTimeline || 'none'}
        
        Message: "${message}"
        
        Extract the timeline with these rules:
        1. "ASAP", "urgent", "immediately" = "immediate"
        2. Specific months (1-12) = "X months"
        3. Seasons = calculate months from today
        4. Years = "X years"
        5. Vague ("soon", "eventually") = "undecided"
        
        Examples:
        "need to move in 3 months" → { "timeline": "3 months", "confidence": 0.95 }
        "looking for spring" → { "timeline": "3-5 months", "confidence": 0.75 }
        "not sure yet" → { "timeline": "undecided", "confidence": 0.9 }
        
        Return only JSON with timeline and confidence (0-1).
        If no timeline mentioned, return { "timeline": null, "confidence": 1.0 }
      `,
      
      budget: `
        You are extracting budget from a real estate lead message.
        
        Context:
        - Market area: ${context.market || 'unknown'}
        - Property type interest: ${context.propertyType || 'unknown'}
        - Previous budget mentioned: ${context.previousBudget || 'none'}
        
        Message: "${message}"
        
        Extract budget with these rules:
        1. Convert "k" to thousands (400k = 400000)
        2. Convert "m" or "million" to millions (1.5m = 1500000)
        3. Assume dollars unless specified otherwise
        4. For ranges, extract both min and max
        5. "Pre-approved for X" counts as budget
        
        Examples:
        "budget is 500k" → { "budget": 500000, "confidence": 0.95 }
        "400-500k range" → { "budgetMin": 400000, "budgetMax": 500000, "confidence": 0.9 }
        "pre-approved for $650,000" → { "budget": 650000, "confidence": 0.95 }
        
        Return only JSON with budget and confidence.
        If no budget mentioned, return { "budget": null, "confidence": 1.0 }
      `
    };
    
    return templates[type] || templates.general;
  }
}
```

### 3. Extraction Feedback Loop (Continuous Improvement)

```javascript
class ExtractionFeedbackSystem {
  constructor() {
    this.feedback = new Map();
    this.corrections = new Map();
  }
  
  async recordExtraction(messageId, extraction) {
    await db.query(
      'INSERT INTO extraction_log (message_id, extraction, confidence, timestamp) VALUES (?, ?, ?, ?)',
      [messageId, JSON.stringify(extraction), extraction.overallConfidence, new Date()]
    );
  }
  
  async recordCorrection(messageId, field, originalValue, correctedValue, reason) {
    const correction = {
      messageId,
      field,
      originalValue,
      correctedValue,
      reason,
      timestamp: new Date()
    };
    
    this.corrections.set(`${messageId}-${field}`, correction);
    
    // Learn from correction
    await this.updateExtractionPatterns(correction);
  }
  
  async updateExtractionPatterns(correction) {
    // Analyze what went wrong
    const analysis = {
      wasEmpty: correction.originalValue === null,
      wasWrong: correction.originalValue !== correction.correctedValue,
      pattern: await this.findPattern(correction)
    };
    
    // Update pattern library or prompt templates
    if (analysis.pattern) {
      await this.patternLibrary.addNegativeExample(
        analysis.pattern,
        correction
      );
    }
  }
  
  async getExtractionStats() {
    const stats = await db.query(`
      SELECT 
        AVG(confidence) as avg_confidence,
        COUNT(*) as total_extractions,
        SUM(CASE WHEN corrected THEN 1 ELSE 0 END) as corrections,
        AVG(CASE WHEN corrected THEN 0 ELSE 1 END) as accuracy
      FROM extraction_log
      WHERE timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    return {
      ...stats[0],
      accuracyByField: await this.getFieldAccuracy(),
      commonErrors: await this.getCommonErrors()
    };
  }
}
```

---

## 📊 Implementation Roadmap

### Phase 1: MVP (Current Plan)
- Basic extraction with Claude
- Zod validation
- Regex fallback
- **Expected: 80% success rate**

### Phase 2: Quick Wins (Week 2)
- Message preprocessing
- Better prompts
- Basic feedback logging
- **Expected: 85% success rate**

### Phase 3: Intelligence Layer (Month 2)
- Two-pass extraction
- Intent classification
- Specialized extractors
- **Expected: 90% success rate**

### Phase 4: Learning System (Month 3)
- Pattern library
- Few-shot learning
- Feedback loop
- **Expected: 93% success rate**

### Phase 5: Production Hardening (Month 4)
- Verification loops
- Hybrid extraction
- Advanced context awareness
- **Expected: 95%+ success rate**

---

## 💡 Other Growth Ideas

### 1. Conversation Intelligence
- Detect buying signals
- Identify objections
- Predict lead score
- Suggest next best action

### 2. Multi-Channel Expansion
- WhatsApp integration
- Facebook Messenger
- Email parsing
- Voice transcription

### 3. Advanced AI Features
- Personality matching
- Sentiment analysis
- Engagement scoring
- Optimal response timing

### 4. Business Intelligence
- Conversion prediction
- ROI tracking
- A/B testing framework
- Performance analytics

### 5. White-Label Features
- Custom AI training per client
- Industry-specific extractors
- Branded conversation flows
- Client-specific KPIs

---

## 📈 ROI Analysis

| Improvement | Dev Time | Success Rate Gain | Revenue Impact | Priority |
|------------|----------|------------------|----------------|----------|
| Message Preprocessing | 30 mins | +3% | Low | High |
| Better Prompts | 1 hour | +5% | Medium | High |
| Two-Pass Extraction | 2 hours | +10% | High | High |
| Pattern Library | 3 hours | +8% | High | Medium |
| Verification Loop | 2 hours | +5% | Medium | Medium |
| Hybrid Pipeline | 2 hours | +2% | Low | Low |

**Recommended Order**:
1. Better Prompts (quick win)
2. Message Preprocessing (easy)
3. Two-Pass Extraction (biggest gain)
4. Pattern Library (long-term value)
5. Others as needed

---

## 🔮 Future Vision

### The Ultimate System (12+ months out)
```javascript
class NextGenExtractor {
  // Self-improving system that:
  // - Learns from every interaction
  // - Adapts to each client's language patterns
  // - Predicts what information is needed next
  // - Suggests questions to ask
  // - Identifies sales opportunities
  // - Handles multiple languages
  // - Works across all channels
  // - Achieves 99%+ accuracy
}
```

### Key Principles for Growth
1. **Measure Everything**: Can't improve what you don't measure
2. **Incremental Improvements**: 1% better every week = 67% better per year
3. **Learn from Failures**: Every missed extraction is a learning opportunity
4. **Customer Feedback**: Real users will show you what matters
5. **Stay Pragmatic**: Perfect is the enemy of shipped

---

## 📝 Notes for Future Implementation

When implementing these improvements:

1. **Start with metrics**: Implement extraction logging first
2. **A/B test changes**: Run old and new in parallel
3. **Monitor confidence**: Track if confidence scores match accuracy
4. **Keep fallbacks**: Never remove working code until replacement is proven
5. **Document patterns**: Build a library of what works and what doesn't

Remember: The goal isn't perfection, it's reliable extraction that saves time and converts leads. Even 85% automation is valuable if the 15% that needs review is clearly identified.

---

## 🎯 Context Enrichment: Full CRM Data Integration

### Overview: This is NOT RAG - It's Context Enrichment

**What RAG Does**: Searches through documents to find relevant information to answer questions
**What We Need**: Pull structured lead data (property views, activities, profile) to provide context for generating responses

This is **Context Enrichment** - pulling structured data from CRM to inform AI responses. Fundamentally different and actually simpler than RAG.

### Available FUB Data We're Not Using Yet

Follow Up Boss tracks extensive lead data that we're currently ignoring:

```javascript
// Current state - Only fetching:
- Conversation messages

// Available in FUB API:
- Property views (with timestamps, URLs, duration)
- Saved properties and searches
- Website activity timeline
- Custom fields (unlimited)
- Lead score and stage
- All activities and events
- Source and campaign data
- Tags and categories
- Open house visits
- Phone call logs
- Email interactions
```

### Implementation: Comprehensive Lead Context Builder

#### 1. Enhanced Data Fetching

```javascript
class EnhancedFUBAdapter {
  // Add these methods to FollowUpBossAdapter
  
  async getActivities(leadId, limit = 100) {
    const response = await axios.get(
      `${this.baseUrl}/events?personId=${leadId}&limit=${limit}`,
      { headers: this.getHeaders() }
    );
    
    return response.data.events.map(event => ({
      type: event.type,
      timestamp: event.created,
      data: event.metadata,
      property: event.property,
      source: event.source
    }));
  }
  
  async getCustomFields(leadId) {
    const person = await this.getPerson(leadId);
    const customFields = {};
    
    // Extract all custom fields
    for (const [key, value] of Object.entries(person)) {
      if (key.startsWith('custom')) {
        customFields[key] = value;
      }
    }
    
    return customFields;
  }
  
  async getTimeline(leadId) {
    // Get comprehensive timeline including all touchpoints
    const response = await axios.get(
      `${this.baseUrl}/people/${leadId}/timeline`,
      { headers: this.getHeaders() }
    );
    
    return response.data;
  }
}
```

#### 2. Smart Context Builder

```javascript
class LeadContextBuilder {
  constructor(fubAdapter) {
    this.fub = fubAdapter;
  }
  
  async buildFullContext(leadId) {
    // Parallel fetch all data sources
    const [profile, activities, customFields, conversations] = await Promise.all([
      this.fub.getPerson(leadId),
      this.fub.getActivities(leadId),
      this.fub.getCustomFields(leadId),
      this.fub.getConversations(leadId)
    ]);
    
    // Structure for AI consumption
    return {
      profile: {
        name: `${profile.firstName} ${profile.lastName}`,
        source: profile.source,
        stage: profile.stage,
        score: profile.leadScore,
        tags: profile.tags,
        assignedTo: profile.assignedUserId,
        createdAt: profile.created
      },
      
      behavior: {
        propertiesViewed: this.extractPropertyViews(activities),
        savedProperties: this.extractSavedProperties(activities),
        lastWebVisit: this.getLastWebVisit(activities),
        totalEngagement: this.calculateEngagement(activities),
        searchCriteria: this.extractSearchCriteria(activities)
      },
      
      preferences: {
        priceRange: this.inferPriceRange(activities),
        locationPreference: this.inferLocationPreference(activities),
        propertyType: this.inferPropertyType(activities),
        timeline: customFields.customTimeline,
        motivation: customFields.customMotivation,
        financingStatus: customFields.customFinancing
      },
      
      conversation: {
        messageCount: conversations.length,
        lastMessage: conversations[conversations.length - 1],
        recentMessages: conversations.slice(-10),
        firstMessage: conversations[0],
        conversationAge: this.calculateConversationAge(conversations)
      },
      
      insights: {
        mostViewedPropertyType: this.getMostViewedPropertyType(activities),
        averagePropertyPrice: this.getAverageViewedPrice(activities),
        engagementTrend: this.calculateEngagementTrend(activities),
        behaviorPatterns: this.identifyPatterns(activities)
      }
    };
  }
  
  extractPropertyViews(activities) {
    return activities
      .filter(a => a.type === 'Property View' || a.type === 'Viewed Property')
      .map(a => ({
        address: a.property?.address,
        price: a.property?.price,
        mlsNumber: a.property?.mlsNumber,
        url: a.property?.url,
        timestamp: a.timestamp,
        duration: a.data?.timeOnPage,
        source: a.source
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
  
  inferPriceRange(activities) {
    const propertyPrices = activities
      .filter(a => a.property?.price)
      .map(a => a.property.price);
    
    if (propertyPrices.length === 0) return null;
    
    return {
      min: Math.min(...propertyPrices),
      max: Math.max(...propertyPrices),
      average: propertyPrices.reduce((a, b) => a + b, 0) / propertyPrices.length
    };
  }
  
  inferLocationPreference(activities) {
    const locations = activities
      .filter(a => a.property?.city || a.property?.zip)
      .map(a => ({
        city: a.property.city,
        zip: a.property.zip
      }));
    
    // Count frequency of each location
    const locationCounts = {};
    locations.forEach(loc => {
      const key = loc.city || loc.zip;
      locationCounts[key] = (locationCounts[key] || 0) + 1;
    });
    
    // Return top 3 locations
    return Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([location, count]) => ({ location, count }));
  }
}
```

#### 3. Context-Aware Selection

```javascript
class SmartContextSelector {
  async getRelevantContext(message, fullContext) {
    // Classify intent to determine what context is needed
    const intent = await this.classifyIntent(message);
    
    switch(intent) {
      case 'property_discussion':
        return {
          recentProperties: fullContext.behavior.propertiesViewed.slice(0, 5),
          priceRange: fullContext.preferences.priceRange,
          savedProperties: fullContext.behavior.savedProperties,
          searchCriteria: fullContext.behavior.searchCriteria,
          averagePrice: fullContext.insights.averagePropertyPrice
        };
        
      case 'scheduling':
        return {
          name: fullContext.profile.name,
          timeline: fullContext.preferences.timeline,
          stage: fullContext.profile.stage,
          lastContact: fullContext.conversation.lastMessage,
          assignedAgent: fullContext.profile.assignedTo
        };
        
      case 'qualification':
        return {
          timeline: fullContext.preferences.timeline,
          financing: fullContext.preferences.financingStatus,
          motivation: fullContext.preferences.motivation,
          engagement: fullContext.behavior.totalEngagement,
          stage: fullContext.profile.stage
        };
        
      case 'general':
        return {
          name: fullContext.profile.name,
          source: fullContext.profile.source,
          engagementSummary: this.createEngagementSummary(fullContext),
          lastActivity: this.getLastActivity(fullContext)
        };
    }
  }
  
  async classifyIntent(message) {
    const intents = {
      property_discussion: /property|house|home|listing|bedroom|bathroom|square|price|neighborhood/i,
      scheduling: /schedule|appointment|showing|tour|meet|call|available/i,
      qualification: /approved|financing|timeline|when|moving|agent|budget/i
    };
    
    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(message)) {
        return intent;
      }
    }
    
    return 'general';
  }
}
```

#### 4. AI Context Formatter

```javascript
class AIContextFormatter {
  formatForClaude(leadContext, currentMessage) {
    // Hierarchical structure for better AI comprehension
    return `
LEAD PROFILE:
Name: ${leadContext.profile.name}
Stage: ${leadContext.profile.stage} | Score: ${leadContext.profile.score}
Source: ${leadContext.profile.source}
First Contact: ${this.formatDate(leadContext.profile.createdAt)}

RECENT PROPERTY ACTIVITY (Last 7 days):
${this.formatPropertyViews(leadContext.recentProperties)}

PREFERENCES (Based on Behavior):
Price Range: ${this.formatPriceRange(leadContext.priceRange)}
Preferred Locations: ${this.formatLocations(leadContext.locationPreference)}
Property Type: ${leadContext.propertyType || 'Not determined'}
Timeline: ${leadContext.timeline || 'Not specified'}

ENGAGEMENT SUMMARY:
- Total Properties Viewed: ${leadContext.totalEngagement?.propertyViews || 0}
- Saved Properties: ${leadContext.totalEngagement?.savedProperties || 0}
- Average Time per Property: ${leadContext.avgTimePerProperty || 'Unknown'}
- Most Interested In: ${leadContext.mostViewedPropertyType || 'Various'}

RECENT CONVERSATION (Last 5 messages):
${this.formatRecentMessages(leadContext.recentMessages)}

CURRENT MESSAGE: "${currentMessage}"

RESPONSE CONTEXT:
- Reference specific properties they've viewed when relevant
- Acknowledge their preferences and search criteria
- Consider their stage in the buying process
- Maintain continuity with recent conversation`;
  }
  
  formatPropertyViews(properties) {
    if (!properties || properties.length === 0) {
      return 'No recent property views';
    }
    
    return properties.slice(0, 5).map(p => 
      `• ${p.address} - $${this.formatNumber(p.price)} - Viewed ${this.timeAgo(p.timestamp)} (${p.duration}s on page)`
    ).join('\n');
  }
  
  formatPriceRange(range) {
    if (!range) return 'Not determined';
    return `$${this.formatNumber(range.min)} - $${this.formatNumber(range.max)} (Avg: $${this.formatNumber(range.average)})`;
  }
}
```

### Implementation Strategy

#### Phase 1: Data Fetching Enhancement (2 hours)
1. Update `FollowUpBossAdapter` with new methods:
   - `getActivities(leadId)`
   - `getCustomFields(leadId)`
   - `getTimeline(leadId)`
2. Add proper error handling and caching

#### Phase 2: Context Building (2 hours)
1. Create `LeadContextBuilder` service
2. Implement data aggregation and inference logic
3. Add smart summarization to avoid token limits

#### Phase 3: Context Selection (1 hour)
1. Create `SmartContextSelector` for intent-based filtering
2. Implement context size optimization
3. Add relevance scoring

#### Phase 4: Integration (1 hour)
1. Update extraction service to use enhanced context
2. Modify prompts to leverage behavioral data
3. Test with real lead scenarios

### Performance Optimization

```javascript
class ContextCache {
  constructor() {
    this.cache = new Map();
    this.maxAge = 5 * 60 * 1000; // 5 minutes
  }
  
  async getContext(leadId, forceRefresh = false) {
    const cached = this.cache.get(leadId);
    
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached.data;
    }
    
    const context = await this.buildContext(leadId);
    
    this.cache.set(leadId, {
      data: context,
      timestamp: Date.now()
    });
    
    return context;
  }
}
```

### ROI Analysis

| Feature | Dev Time | Value Add | Priority |
|---------|----------|-----------|----------|
| Basic Activity Fetching | 2 hours | High - Enables property-based responses | HIGH |
| Smart Context Selection | 1 hour | High - Reduces token costs | HIGH |
| Behavioral Inference | 2 hours | Medium - Better personalization | MEDIUM |
| Pattern Recognition | 3 hours | Low - Nice to have | LOW |

### Integration with Current Plan

This context enrichment can be partially implemented alongside the main extraction work:

- **During Todo #4** "Implement smart context management" → Build the context builder
- **During Todo #8** "Create CRM update methods" → Add the fetch methods
- **During Todo #6** "Implement Twilio webhook" → Use enhanced context immediately

About 40% of this work integrates directly with the current implementation plan.

---

*Last Updated: January 21, 2025*
*Next Review: After 1000 messages processed*
*Contact: Check git history for contributors*