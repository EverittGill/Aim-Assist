# Follow Up Boss Conversation History Documentation

## Overview
Fetching complete conversation history from Follow Up Boss is critical for the Eugenia ISA system. This ensures AI responses have full context and never "forget" previous conversations - the core value proposition of our system.

## Why Conversation History Matters

### The Core Problem
- **Raiya Text ($400/month) loses context** between conversations
- Leads get frustrated when AI forgets what they discussed
- No continuity in nurturing relationships

### Our Solution
- Fetch **complete conversation history** from FUB before generating responses
- Pass **full context** to Gemini AI
- Maintain **persistent memory** across all interactions

## Text Messages Endpoints

### Fetch Text Messages for a Person
```
GET https://api.followupboss.com/v1/people/{personId}/textMessages
```

### Fetch All Text Messages
```
GET https://api.followupboss.com/v1/textMessages
```

### Query Parameters
- `personId`: Filter by specific person (when using /textMessages)
- `limit`: Results per page (default: 20, max: 500)
- `offset`: Number to skip for pagination
- `sort`: Sort field (created, updated)
- `order`: Sort order (asc, desc)
- `since`: ISO date to fetch messages after
- `until`: ISO date to fetch messages before

## Message Object Schema

```json
{
  "id": "msg_123456",
  "personId": "12345",
  "userId": "789", // FUB user who sent/received
  "message": "Hi! I'm interested in homes in Austin under $400k",
  "direction": "inbound", // or "outbound"
  "toNumber": "+12025551234",
  "fromNumber": "+15551234567",
  "created": "2025-01-13T15:30:00Z",
  "updated": "2025-01-13T15:30:00Z",
  "status": "delivered", // delivered, failed, pending
  "type": "sms", // sms, mms
  "source": "manual" // manual, automated, api
}
```

## Implementation for Context Retention

### Fetching Complete Conversation History
```javascript
async function fetchConversationHistory(personId, limit = 500) {
  try {
    const response = await fubAPI.get(`/people/${personId}/textMessages`, {
      params: {
        limit: limit,
        sort: 'created',
        order: 'asc' // Chronological order for context
      }
    });
    
    return response.data.textMessages || [];
  } catch (error) {
    console.error(`Failed to fetch conversation history for person ${personId}:`, error);
    
    // Fallback to frontend-stored history if FUB fails
    return getFrontendConversationHistory(personId);
  }
}
```

### Processing Messages for AI Context
```javascript
function formatMessagesForAI(messages, personName) {
  if (!messages || messages.length === 0) {
    return "No previous conversation history.";
  }
  
  const conversationText = messages
    .map(msg => {
      const sender = msg.direction === 'inbound' ? personName : 'You (AI Assistant)';
      const timestamp = new Date(msg.created).toLocaleDateString();
      return `${sender} (${timestamp}): ${msg.message}`;
    })
    .join('\n');
  
  return `Previous conversation history:\n${conversationText}`;
}
```

### Core Context Retention Function
```javascript
async function generateContextAwareResponse(personId, newMessage, personName) {
  // 1. Fetch complete conversation history from FUB
  const conversationHistory = await fetchConversationHistory(personId);
  
  // 2. Format for AI context
  const contextText = formatMessagesForAI(conversationHistory, personName);
  
  // 3. Create prompt with full context
  const prompt = `You are Eugenia, a professional real estate AI assistant for ${process.env.USER_AGENCY_NAME}.

IMPORTANT: You have been having an ongoing conversation with ${personName}. Here is the complete conversation history:

${contextText}

The lead just sent you this new message: "${newMessage}"

Based on the complete conversation history above, provide a natural, contextual response that:
1. References previous conversations when relevant
2. Continues the relationship naturally
3. Moves the conversation forward appropriately
4. Maintains consistency with your previous responses

Your response:`;

  // 4. Generate response with full context
  const aiResponse = await generateGeminiResponse(prompt);
  
  return aiResponse;
}
```

### Conversation Service Implementation
```javascript
class ConversationService {
  constructor() {
    this.fubAPI = createFUBClient();
  }
  
  async getFullContext(personId) {
    try {
      // Fetch up to 500 messages (FUB max)
      const messages = await this.fetchConversationHistory(personId, 500);
      
      return {
        messageCount: messages.length,
        firstMessage: messages[0]?.created,
        lastMessage: messages[messages.length - 1]?.created,
        messages: messages
      };
    } catch (error) {
      console.error('Context fetch failed:', error);
      return { messageCount: 0, messages: [] };
    }
  }
  
  async fetchConversationHistory(personId, limit = 500) {
    const response = await this.fubAPI.get(`/people/${personId}/textMessages`, {
      params: { limit, sort: 'created', order: 'asc' }
    });
    
    return response.data.textMessages || [];
  }
  
  formatForAI(messages, leadName) {
    if (!messages.length) return "No previous conversation.";
    
    return messages.map(msg => {
      const sender = msg.direction === 'inbound' ? leadName : 'Eugenia (AI)';
      const date = new Date(msg.created).toLocaleDateString();
      return `${sender} (${date}): ${msg.message}`;
    }).join('\n');
  }
  
  async generateContextualResponse(personId, newMessage, leadName) {
    // Get full conversation context
    const context = await this.getFullContext(personId);
    const contextText = this.formatForAI(context.messages, leadName);
    
    // Generate response with context
    const prompt = this.buildContextAwarePrompt(contextText, newMessage, leadName);
    return await generateGeminiResponse(prompt);
  }
  
  buildContextAwarePrompt(contextText, newMessage, leadName) {
    return `You are Eugenia, an AI real estate assistant for ${process.env.USER_AGENCY_NAME}.

CONVERSATION HISTORY:
${contextText}

NEW MESSAGE FROM ${leadName.toUpperCase()}: "${newMessage}"

Respond naturally, referencing the conversation history when appropriate. Be helpful, professional, and keep the real estate conversation moving forward.`;
  }
}
```

## Pagination for Large Conversations

### Handling 500+ Messages
```javascript
async function fetchAllConversationHistory(personId) {
  const allMessages = [];
  let offset = 0;
  const limit = 500; // FUB max
  
  while (true) {
    const response = await fubAPI.get(`/people/${personId}/textMessages`, {
      params: { limit, offset, sort: 'created', order: 'asc' }
    });
    
    const messages = response.data.textMessages || [];
    allMessages.push(...messages);
    
    if (messages.length < limit) {
      break; // No more messages
    }
    
    offset += limit;
  }
  
  return allMessages;
}
```

### Smart Context Windowing
For very long conversations, use recent + important messages:
```javascript
function selectContextualMessages(messages, maxTokens = 4000) {
  // Always include recent messages
  const recentMessages = messages.slice(-20);
  
  // Find important messages (appointments, property details, etc.)
  const importantMessages = messages.filter(msg => 
    msg.message.toLowerCase().includes('appointment') ||
    msg.message.toLowerCase().includes('showing') ||
    msg.message.toLowerCase().includes('price') ||
    msg.message.toLowerCase().includes('address')
  );
  
  // Combine and dedupe
  const contextMessages = [
    ...importantMessages,
    ...recentMessages
  ].filter((msg, index, arr) => 
    arr.findIndex(m => m.id === msg.id) === index
  );
  
  // Sort chronologically
  return contextMessages.sort((a, b) => 
    new Date(a.created) - new Date(b.created)
  );
}
```

## Error Handling & Fallbacks

### Robust Context Fetching
```javascript
async function getConversationContextWithFallback(personId, leadName) {
  let context = "No previous conversation available.";
  
  try {
    // Try FUB first
    const messages = await fetchConversationHistory(personId);
    if (messages && messages.length > 0) {
      context = formatMessagesForAI(messages, leadName);
    }
  } catch (fubError) {
    console.warn('FUB context fetch failed, trying frontend fallback:', fubError);
    
    try {
      // Fallback to frontend-stored conversation
      const frontendHistory = await getFrontendConversationHistory(personId);
      if (frontendHistory && frontendHistory.length > 0) {
        context = formatMessagesForAI(frontendHistory, leadName);
      }
    } catch (frontendError) {
      console.error('All context fetch attempts failed:', frontendError);
      // Continue with no context rather than failing
    }
  }
  
  return context;
}
```

### Network Timeout Handling
```javascript
async function fetchWithTimeout(personId, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fubAPI.get(`/people/${personId}/textMessages`, {
      signal: controller.signal,
      params: { limit: 100, sort: 'created', order: 'asc' }
    });
    
    clearTimeout(timeoutId);
    return response.data.textMessages || [];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn('FUB context fetch timed out, using fallback');
      return getFrontendConversationHistory(personId);
    }
    throw error;
  }
}
```

## Performance Optimization

### Caching Strategy
```javascript
class ConversationCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }
  
  async getContext(personId) {
    const cached = this.cache.get(personId);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    // Fetch fresh data
    const messages = await fetchConversationHistory(personId);
    this.cache.set(personId, {
      data: messages,
      timestamp: Date.now()
    });
    
    return messages;
  }
  
  invalidate(personId) {
    this.cache.delete(personId);
  }
}
```

### Incremental Updates
```javascript
async function getUpdatedContext(personId, lastFetchTime) {
  // Only fetch new messages since last fetch
  const response = await fubAPI.get(`/people/${personId}/textMessages`, {
    params: {
      since: lastFetchTime,
      sort: 'created',
      order: 'asc'
    }
  });
  
  return response.data.textMessages || [];
}
```

## Integration Examples

### Complete Context-Aware Response Flow
```javascript
async function handleIncomingMessage(personId, message, leadName) {
  try {
    // 1. Fetch complete conversation history
    console.log(`Fetching conversation history for ${leadName}...`);
    const context = await getConversationContextWithFallback(personId, leadName);
    
    // 2. Generate contextual response
    console.log(`Generating AI response with ${context.split('\n').length} lines of context...`);
    const aiResponse = await generateContextAwareResponse(personId, message, leadName);
    
    // 3. Log both messages to FUB
    await Promise.all([
      // Log incoming message
      logMessageToFUB(personId, message, 'inbound'),
      // Log AI response
      logMessageToFUB(personId, aiResponse, 'outbound')
    ]);
    
    // 4. Send response via Twilio
    await sendSMSResponse(personId, aiResponse);
    
    return aiResponse;
  } catch (error) {
    console.error('Context-aware response failed:', error);
    throw error;
  }
}
```

### Testing Context Retention
```javascript
async function testContextRetention() {
  const testPersonId = '470'; // Test Everitt
  
  // Fetch context
  const messages = await fetchConversationHistory(testPersonId);
  console.log(`Fetched ${messages.length} messages`);
  
  // Test formatting
  const context = formatMessagesForAI(messages, 'Test Everitt');
  console.log('Formatted context:', context);
  
  // Test AI response with context
  const response = await generateContextAwareResponse(
    testPersonId, 
    "What did we discuss about the price range?",
    'Test Everitt'
  );
  
  console.log('AI Response:', response);
}
```

## Best Practices

1. **Always fetch context** before generating AI responses
2. **Handle failures gracefully** with fallback options
3. **Cache context** for performance but invalidate appropriately
4. **Limit context size** for very long conversations
5. **Log context fetches** for debugging
6. **Test with real conversation data** regularly