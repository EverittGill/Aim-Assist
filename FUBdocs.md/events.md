# Follow Up Boss Events API Documentation

## Overview
The `/events` endpoint is the preferred way to send lead data into Follow Up Boss. It's designed for high-volume lead providers and ensures proper deduplication and attribution.

## Why Use Events Instead of People?

The events endpoint provides several advantages over directly creating people:
- **Automatic deduplication** based on email/phone
- **Source attribution** tracking
- **Better handling** of concurrent submissions
- **Event history** for debugging
- **Webhook triggers** for real-time processing

## Endpoint

```
POST https://api.followupboss.com/v1/events
```

## Event Types

### 1. New Lead Event
Used to create or update a lead in FUB.

```json
{
  "event": "lead",
  "source": "Eugenia AI Assistant",
  "person": {
    "firstName": "John",
    "lastName": "Doe",
    "emails": [{
      "value": "john@example.com"
    }],
    "phones": [{
      "value": "+12025551234"
    }]
  },
  "property": {
    "address": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  },
  "message": "Interested in homes under $500k in Austin area",
  "assignedUserId": "123"
}
```

### 2. Note Event
Add a note to an existing lead.

```json
{
  "event": "note",
  "personId": "12345",
  "note": "AI Assistant: Lead responded positively to initial outreach"
}
```

### 3. Custom Event
Track custom activities or milestones.

```json
{
  "event": "custom",
  "type": "ai_conversation_started",
  "personId": "12345",
  "data": {
    "conversationId": "conv_abc123",
    "aiModel": "gemini-pro"
  }
}
```

## Required Fields

### For Lead Events
- `event`: Must be "lead"
- `source`: String identifying the lead source
- `person`: Object with at least one identifier:
  - `emails[].value` OR
  - `phones[].value`

### For Note Events
- `event`: Must be "note"
- `personId`: FUB person ID
- `note`: Note content

## Person Object Schema

```json
{
  "person": {
    // Name fields
    "firstName": "John",
    "lastName": "Doe",
    "name": "John Doe", // Alternative to first/last
    
    // Contact info
    "emails": [
      {
        "value": "john@example.com",
        "type": "personal" // personal, work, other
      }
    ],
    "phones": [
      {
        "value": "+12025551234",
        "type": "mobile" // mobile, home, work, fax
      }
    ],
    
    // Address
    "address": {
      "street": "123 Main St",
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "country": "US"
    },
    
    // Lead details
    "tags": ["Hot Lead", "AI Managed"],
    "customFields": {
      "eugenia_link": "https://eugenia.ai/leads/abc123",
      "preferred_contact": "text"
    }
  }
}
```

## Implementation Examples

### Creating a Lead via Events
```javascript
async function createLeadEvent(leadData) {
  const eventPayload = {
    event: 'lead',
    source: 'Eugenia AI Assistant',
    person: {
      firstName: leadData.firstName,
      lastName: leadData.lastName,
      emails: leadData.email ? [{
        value: leadData.email,
        type: 'personal'
      }] : [],
      phones: leadData.phone ? [{
        value: formatPhoneForFUB(leadData.phone),
        type: 'mobile'
      }] : [],
      tags: ['AI Managed', 'New Lead'],
      customFields: {
        eugenia_link: generateEugeniaLink(leadData),
        lead_temperature: leadData.temperature || 'warm'
      }
    },
    message: leadData.initialMessage || 'New lead from Eugenia AI',
    assignedUserId: process.env.FUB_USER_ID_FOR_AI
  };
  
  // Add property details if available
  if (leadData.propertyInterest) {
    eventPayload.property = {
      address: leadData.propertyInterest.address,
      city: leadData.propertyInterest.city,
      state: leadData.propertyInterest.state,
      zip: leadData.propertyInterest.zip,
      price: leadData.propertyInterest.price,
      type: leadData.propertyInterest.type // 'Single Family', 'Condo', etc.
    };
  }
  
  const response = await fubAPI.post('/events', eventPayload);
  return response.data;
}
```

### Adding AI Conversation Notes
```javascript
async function addAIConversationNote(personId, message, aiResponse) {
  const noteContent = `AI Conversation:
Lead: ${message}
Eugenia: ${aiResponse}
Timestamp: ${new Date().toISOString()}`;
  
  const eventPayload = {
    event: 'note',
    personId: personId,
    note: noteContent,
    isSystemNote: true // Marks as system-generated
  };
  
  const response = await fubAPI.post('/events', eventPayload);
  return response.data;
}
```

### Tracking AI Milestones
```javascript
async function trackAIMilestone(personId, milestone) {
  const eventPayload = {
    event: 'custom',
    type: 'ai_milestone',
    personId: personId,
    data: {
      milestone: milestone, // 'first_response', 'appointment_scheduled', etc.
      timestamp: new Date().toISOString(),
      aiSessionId: generateSessionId()
    }
  };
  
  const response = await fubAPI.post('/events', eventPayload);
  return response.data;
}
```

### Batch Lead Import
```javascript
async function importLeadsBatch(leads) {
  const events = leads.map(lead => ({
    event: 'lead',
    source: 'Eugenia Bulk Import',
    person: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      emails: lead.email ? [{ value: lead.email }] : [],
      phones: lead.phone ? [{ value: formatPhoneForFUB(lead.phone) }] : [],
      customFields: {
        import_batch: new Date().toISOString(),
        eugenia_status: 'pending'
      }
    }
  }));
  
  // Send events one by one (FUB doesn't support batch events)
  const results = [];
  for (const event of events) {
    try {
      const result = await fubAPI.post('/events', event);
      results.push({ success: true, data: result.data });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }
  
  return results;
}
```

## Response Format

### Success Response
```json
{
  "id": "evt_123456",
  "event": "lead",
  "personId": "12345",
  "created": "2025-01-13T12:00:00Z",
  "status": "processed"
}
```

### Error Response
```json
{
  "error": "Validation Error",
  "message": "Missing required field: person.emails or person.phones",
  "field": "person"
}
```

## Deduplication Logic

FUB uses the following logic to match existing people:
1. **Email match** (exact match, case-insensitive)
2. **Phone match** (normalized number comparison)
3. **Name + Address** (if no email/phone provided)

When a match is found:
- Existing person is updated with new data
- Tags are merged (not replaced)
- Custom fields are updated
- New note is added if message provided

## Best Practices

### 1. Always Include Source
```javascript
const eventPayload = {
  event: 'lead',
  source: 'Eugenia AI - Website Chat', // Be specific
  // ... rest of payload
};
```

### 2. Use Events for New Leads
```javascript
// Preferred for new leads
async function createLead(data) {
  return fubAPI.post('/events', {
    event: 'lead',
    source: 'Eugenia AI',
    person: data
  });
}

// Use people endpoint only for updates
async function updateLead(id, data) {
  return fubAPI.put(`/people/${id}`, data);
}
```

### 3. Include Meaningful Messages
```javascript
const eventPayload = {
  event: 'lead',
  source: 'Eugenia AI Assistant',
  person: leadData,
  message: `Lead expressed interest in ${leadData.propertyType} properties 
            in ${leadData.location}. Budget: ${leadData.budget}. 
            Preferred contact: ${leadData.preferredContact}`
};
```

### 4. Track Conversation Context
```javascript
async function logAIInteraction(personId, interaction) {
  // Add as note for conversation history
  await fubAPI.post('/events', {
    event: 'note',
    personId: personId,
    note: formatConversationNote(interaction)
  });
  
  // Track metrics with custom event
  await fubAPI.post('/events', {
    event: 'custom',
    type: 'ai_interaction',
    personId: personId,
    data: {
      messageCount: interaction.messageCount,
      sentiment: interaction.sentiment,
      engagementScore: interaction.score
    }
  });
}
```

### 5. Error Handling
```javascript
async function createLeadWithRetry(leadData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fubAPI.post('/events', {
        event: 'lead',
        source: 'Eugenia AI',
        person: leadData
      });
    } catch (error) {
      if (error.response?.status === 400) {
        // Validation error - don't retry
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }
}
```

## Integration with Eugenia ISA

### New Lead Processing Flow
```javascript
async function processNewLeadForAI(leadData) {
  // 1. Create/update lead via events
  const eventResult = await fubAPI.post('/events', {
    event: 'lead',
    source: 'Eugenia AI - Auto Import',
    person: {
      ...leadData,
      tags: ['AI Queue', 'Pending Outreach']
    }
  });
  
  // 2. Generate Eugenia link
  const eugeniaLink = generateEugeniaLink(eventResult.personId);
  
  // 3. Update with Eugenia link
  await fubAPI.put(`/people/${eventResult.personId}`, {
    customFields: {
      eugenia_link: eugeniaLink,
      ai_status: 'active',
      ai_enabled_date: new Date().toISOString()
    }
  });
  
  // 4. Add initial note
  await fubAPI.post('/events', {
    event: 'note',
    personId: eventResult.personId,
    note: 'Lead enrolled in Eugenia AI nurturing system'
  });
  
  return eventResult.personId;
}
```

## Testing

### Test Event Creation
```javascript
async function testEventCreation() {
  const testEvent = {
    event: 'lead',
    source: 'Eugenia Test',
    person: {
      firstName: 'Test',
      lastName: 'User',
      emails: [{ value: `test${Date.now()}@example.com` }],
      phones: [{ value: '+15555550100' }],
      tags: ['Test Lead'],
      customFields: {
        test_timestamp: new Date().toISOString()
      }
    },
    message: 'Test lead creation via events API'
  };
  
  try {
    const result = await fubAPI.post('/events', testEvent);
    console.log('✅ Event created:', result.data);
  } catch (error) {
    console.error('❌ Event creation failed:', error.response?.data);
  }
}
```