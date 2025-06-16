# Follow Up Boss People (Leads/Contacts) API Documentation

## Overview
The `/people` endpoint is the primary way to manage leads and contacts in Follow Up Boss. This is the core resource for the Eugenia ISA system to fetch and update lead information.

## Endpoints

### List People
```
GET https://api.followupboss.com/v1/people
```

### Get Single Person
```
GET https://api.followupboss.com/v1/people/{id}
```

### Create Person
```
POST https://api.followupboss.com/v1/people
```

### Update Person
```
PUT https://api.followupboss.com/v1/people/{id}
```

### Delete Person
```
DELETE https://api.followupboss.com/v1/people/{id}
```

## Query Parameters

### Pagination
- `limit`: Number of results per page (default: 20, max: 100)
- `offset`: Number of records to skip
- `page`: Page number (alternative to offset)

### Filtering
- `q`: Search query (searches name, email, phone)
- `stage`: Filter by pipeline stage
- `assignedUserId`: Filter by assigned user
- `created`: Filter by creation date
- `updated`: Filter by last update
- `tags`: Filter by tags (comma-separated)

### Sorting
- `sort`: Field to sort by (created, updated, name)
- `order`: Sort order (asc, desc)

### Field Selection
- `fields`: Comma-separated list of fields to return
- `includeCustomFields`: Include custom field data (true/false)

## Person Object Schema

### Core Fields
```json
{
  "id": "12345",
  "created": "2025-01-13T10:00:00Z",
  "updated": "2025-01-13T15:30:00Z",
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "emails": [
    {
      "value": "john@example.com",
      "isPrimary": true
    }
  ],
  "phones": [
    {
      "value": "+12025551234",
      "type": "mobile",
      "isPrimary": true
    }
  ],
  "assignedUserId": "789",
  "stage": "New Lead",
  "source": "Website",
  "tags": ["Hot Lead", "Buyer"],
  "customFields": {},
  // ... more fields
}
```

### Important Fields for Eugenia ISA

#### Contact Information
- `emails[]`: Array of email objects
  - `value`: Email address
  - `isPrimary`: Boolean for primary email
- `phones[]`: Array of phone objects
  - `value`: Phone number (various formats accepted)
  - `type`: mobile, home, work, fax
  - `isPrimary`: Boolean for primary phone

#### Lead Management
- `assignedUserId`: ID of assigned FUB user
- `stage`: Current pipeline stage
- `source`: Lead source
- `tags[]`: Array of tag strings
- `status`: Lead status (active, archived)

#### Custom Fields
- Accessed via `customFields` object
- Field names are lowercase with spaces replaced by underscores
- Example: "Eugenia Link" becomes `customFields.eugenia_link`

## Implementation Examples

### Fetching Leads for AI Processing
```javascript
async function fetchLeadsForAI() {
  const response = await fubAPI.get('/people', {
    params: {
      limit: 100,
      assignedUserId: process.env.FUB_USER_ID_FOR_AI,
      stage: 'New Lead',
      sort: 'created',
      order: 'desc',
      includeCustomFields: true
    }
  });
  
  return response.data.people.filter(lead => {
    // Only process leads without Eugenia Link
    return !lead.customFields?.eugenia_link;
  });
}
```

### Getting Lead Phone Number
```javascript
function getLeadPhone(person) {
  // Try multiple phone sources
  if (person.phones && person.phones.length > 0) {
    // Prefer primary phone
    const primaryPhone = person.phones.find(p => p.isPrimary);
    if (primaryPhone) return primaryPhone.value;
    
    // Prefer mobile
    const mobilePhone = person.phones.find(p => p.type === 'mobile');
    if (mobilePhone) return mobilePhone.value;
    
    // Use first available
    return person.phones[0].value;
  }
  
  // Check custom fields as fallback
  if (person.customFields?.phone) {
    return person.customFields.phone;
  }
  
  return null;
}
```

### Creating a New Lead
```javascript
async function createLead(leadData) {
  const payload = {
    name: `${leadData.firstName} ${leadData.lastName}`,
    firstName: leadData.firstName,
    lastName: leadData.lastName,
    emails: [{
      value: leadData.email,
      isPrimary: true
    }],
    phones: [{
      value: formatPhoneForFUB(leadData.phone),
      type: 'mobile',
      isPrimary: true
    }],
    source: 'Eugenia AI Assistant',
    assignedUserId: process.env.FUB_USER_ID_FOR_AI,
    tags: ['AI Managed'],
    customFields: {
      eugenia_link: generateEugeniaLink(leadData)
    }
  };
  
  const response = await fubAPI.post('/people', payload);
  return response.data;
}
```

### Updating Lead with Eugenia Link
```javascript
async function updateLeadWithEugeniaLink(leadId, eugeniaLink) {
  const payload = {
    customFields: {
      [process.env.FUB_EUGENIA_LINK_CUSTOM_FIELD_NAME]: eugeniaLink
    }
  };
  
  const response = await fubAPI.put(`/people/${leadId}`, payload);
  return response.data;
}
```

### Searching for Leads
```javascript
async function searchLeads(query) {
  const response = await fubAPI.get('/people', {
    params: {
      q: query,
      limit: 50,
      includeCustomFields: true
    }
  });
  
  return response.data.people;
}
```

## Pagination Handling

### Using Offset-based Pagination
```javascript
async function getAllLeads() {
  const allLeads = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const response = await fubAPI.get('/people', {
      params: { limit, offset }
    });
    
    allLeads.push(...response.data.people);
    
    if (response.data.people.length < limit) {
      break; // No more results
    }
    
    offset += limit;
  }
  
  return allLeads;
}
```

### Response Metadata
```json
{
  "_metadata": {
    "total": 500,
    "count": 20,
    "offset": 0,
    "limit": 20
  },
  "people": [...]
}
```

## Custom Fields

### Working with Custom Fields
1. Field names are normalized:
   - Lowercase
   - Spaces → underscores
   - Special chars removed

2. Common Eugenia custom fields:
   - `eugenia_link`: Unique link for lead
   - `ai_status`: AI processing status
   - `last_ai_contact`: Last AI interaction date

### Setting Custom Fields
```javascript
// Single custom field
await fubAPI.put(`/people/${leadId}`, {
  customFields: {
    ai_status: 'active'
  }
});

// Multiple custom fields
await fubAPI.put(`/people/${leadId}`, {
  customFields: {
    eugenia_link: 'https://eugenia.ai/leads/abc123',
    ai_status: 'active',
    last_ai_contact: new Date().toISOString()
  }
});
```

## Bulk Operations

### Batch Fetch by IDs
```javascript
async function fetchLeadsByIds(ids) {
  const response = await fubAPI.get('/people', {
    params: {
      ids: ids.join(','),
      includeCustomFields: true
    }
  });
  
  return response.data.people;
}
```

### Batch Update Tags
```javascript
async function addTagsToLeads(leadIds, tags) {
  const promises = leadIds.map(id => 
    fubAPI.put(`/people/${id}`, {
      tags: { add: tags }
    })
  );
  
  return Promise.all(promises);
}
```

## Error Handling

### Common Errors
```javascript
try {
  const lead = await fubAPI.get(`/people/${leadId}`);
} catch (error) {
  if (error.response?.status === 404) {
    console.error('Lead not found');
  } else if (error.response?.status === 400) {
    console.error('Invalid request:', error.response.data);
  } else if (error.response?.status === 403) {
    console.error('No permission to access this lead');
  }
}
```

## Best Practices

### 1. Efficient Field Selection
Only request fields you need:
```javascript
// Good - specific fields
const response = await fubAPI.get('/people', {
  params: {
    fields: 'id,name,phones,customFields.eugenia_link'
  }
});

// Avoid - fetching everything
const response = await fubAPI.get('/people');
```

### 2. Phone Number Handling
Always handle multiple phone formats:
```javascript
function extractPhoneFromLead(lead) {
  const sources = [
    () => lead.phones?.find(p => p.isPrimary)?.value,
    () => lead.phones?.find(p => p.type === 'mobile')?.value,
    () => lead.phones?.[0]?.value,
    () => lead.customFields?.phone,
    () => lead.customFields?.mobile_phone
  ];
  
  for (const source of sources) {
    const phone = source();
    if (phone) return formatPhoneForFUB(phone);
  }
  
  return null;
}
```

### 3. Null Safety
Always check for field existence:
```javascript
// Safe access
const email = lead.emails?.[0]?.value || null;
const phone = lead.phones?.[0]?.value || null;
const eugeniaLink = lead.customFields?.eugenia_link || null;
```

### 4. Rate Limiting
Implement retry logic:
```javascript
async function fetchLeadWithRetry(leadId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fubAPI.get(`/people/${leadId}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

## Testing

### Test Lead
Always use Test Everitt (ID: 470) for testing:
```javascript
const TEST_LEAD_ID = '470';

async function testLeadOperations() {
  // Fetch test lead
  const lead = await fubAPI.get(`/people/${TEST_LEAD_ID}`);
  console.log('Test lead:', lead.data);
  
  // Update test lead
  await fubAPI.put(`/people/${TEST_LEAD_ID}`, {
    customFields: {
      test_field: new Date().toISOString()
    }
  });
}
```