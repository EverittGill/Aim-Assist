# Follow Up Boss API Reference

## Overview
This document provides a comprehensive reference for the Follow Up Boss (FUB) API integration with Aim Assist. It documents all available fields, endpoints, and data structures we can leverage to provide rich context for AI-powered conversations.

## Base Configuration
- **Base URL**: `https://api.followupboss.com/v1`
- **Authentication**: Basic Auth with API key
- **Required Headers**:
  - `Authorization`: Basic {base64(api_key:)}
  - `X-System`: System identifier (e.g., "Aim-Assist")
  - `X-System-Key`: System authentication key
  - `Content-Type`: application/json

## Core Endpoints

### 1. People (Leads/Contacts)
**Endpoint**: `/people`

#### Standard Fields Available
Based on API documentation and our implementation:

**Basic Information**:
- `id` (number): Unique FUB identifier
- `firstName` (string): First name
- `lastName` (string): Last name
- `name` (string): Full name
- `background` (string): Notes/background information
- `isLead` (boolean): Lead vs contact status

**Contact Information**:
- `phones` (array): Array of phone objects
  - `value` (string): Phone number
  - `type` (string): Phone type (mobile, home, work)
  - `isPrimary` (boolean): Primary phone flag
- `emails` (array): Array of email objects
  - `value` (string): Email address
  - `type` (string): Email type
  - `isPrimary` (boolean): Primary email flag
- `addresses` (array): Array of address objects
  - `street` (string): Street address
  - `city` (string): City
  - `state` (string): State
  - `postalCode` (string): Zip code
  - `country` (string): Country
  - `type` (string): Address type

**Lead Management**:
- `stage` (string): Current pipeline stage
- `source` (string): Lead source
- `sourceDetails` (object): Additional source information
- `tags` (array): Array of tags/labels
- `score` (number): Lead score
- `temperature` (string): Hot/Warm/Cold
- `assignedUserId` (number): Assigned agent ID
- `assignedUser` (object): Assigned agent details

**Activity Tracking**:
- `created` (datetime): Creation timestamp
- `updated` (datetime): Last update timestamp
- `lastActivity` (datetime): Last activity timestamp
- `lastInboundActivity` (datetime): Last inbound contact
- `lastOutboundActivity` (datetime): Last outbound contact
- `contacted` (datetime): First contact date

**Custom Fields**:
- `customFields` (array): Dynamic custom field data
  - Common real estate fields:
    - `propertyType` (string): House, Condo, etc.
    - `priceMin` (number): Minimum price
    - `priceMax` (number): Maximum price
    - `bedrooms` (number): Desired bedrooms
    - `bathrooms` (number): Desired bathrooms
    - `sqft` (number): Square footage
    - `timeline` (string): Buying/selling timeline
    - `financing` (string): Financing status
    - `downPayment` (number): Down payment amount
    - `preApproved` (boolean): Pre-approval status

**Relationships**:
- `relationships` (array): Related contacts/family members
- `deals` (array): Associated deals/transactions

#### Getting All Fields
To retrieve complete lead data, use the `fields` parameter:
```
GET /people/{id}?fields=allFields
```

### 2. Text Messages
**Endpoint**: `/textMessages`

Used for logging SMS conversations to appear in FUB's native interface.

#### Required Fields
- `personId` (number): Lead/contact ID
- `message` (string): Message content
- `fromNumber` (string): Sender phone number (E.164 format)
- `toNumber` (string): Recipient phone number (E.164 format)

#### Optional Fields
- `created` (datetime): Message timestamp
- `userId` (number): User ID for attribution

#### Important Notes
- Messages created via API are logs only (no actual SMS sent)
- Both inbound and outbound messages should be logged
- Messages appear in FUB's conversation timeline

### 3. Custom Fields
**Endpoint**: `/customFields`

#### Structure
- `id` (number): Custom field ID
- `name` (string): API field name (e.g., "customTimeline")
- `label` (string): Display label
- `type` (string): Field type (text, date, number, dropdown)
- `choices` (array): Options for dropdown fields
- `isRecurring` (boolean): For recurring date fields

#### Common Real Estate Custom Fields
Based on typical implementations:
- `customTimeline`: Buying/selling timeline
- `customBudget`: Budget range
- `customMotivation`: Purchase motivation
- `customPropertyType`: Property type preference
- `customFinancing`: Financing method
- `customPreApproval`: Pre-approval status
- `customAreaOfInterest`: Preferred neighborhoods
- `customMustHaves`: Must-have features
- `customDealType`: Buy/Sell/Both
- `customReferralSource`: How they found you

### 4. Events
**Endpoint**: `/events`

Used for tracking lead activity and property interactions.

#### Event Types
- `Registration`: New lead signup
- `Property Inquiry`: Interest in specific property
- `Seller Inquiry`: Seller lead activity
- `General Inquiry`: General contact
- `Visited Open House`: Open house attendance

#### Key Fields
- `type` (string): Event type
- `description` (string): Event details
- `source` (string): Event source
- `property` (object): Property details (if applicable)
- `personId` (number): Associated lead ID
- `customFields` (array): Additional data

### 5. Notes
**Endpoint**: `/notes`

For adding notes to lead records.

#### Fields
- `personId` (number): Lead ID
- `note` (string): Note content
- `userId` (number): Author ID

## Data Mapping Strategy

### From FUB to Supabase
```javascript
{
  // Core identification
  fub_lead_id: fubLead.id,
  
  // Basic info
  first_name: fubLead.firstName,
  last_name: fubLead.lastName,
  
  // Contact arrays (store complete data)
  phones: fubLead.phones, // Full array with types
  emails: fubLead.emails, // Full array with types
  addresses: fubLead.addresses, // Full array
  
  // Primary contact (extracted)
  phone: primaryPhone.value,
  email: primaryEmail.value,
  
  // Lead management
  stage: fubLead.stage,
  source: fubLead.source,
  tags: fubLead.tags,
  score: fubLead.score,
  temperature: fubLead.temperature,
  
  // Assignment
  assigned_agent_id: fubLead.assignedUserId,
  
  // Custom fields
  custom_data: {
    ...fubLead.customFields,
    propertyPreferences: {
      type: fubLead.customPropertyType,
      priceMin: fubLead.customPriceMin,
      priceMax: fubLead.customPriceMax,
      bedrooms: fubLead.customBedrooms,
      bathrooms: fubLead.customBathrooms
    }
  },
  
  // Store complete FUB response
  fub_data: fubLead // Complete API response for reference
}
```

## Context Building for AI

With complete FUB data, we can build rich context:

```javascript
const context = {
  // Personal
  name: `${lead.first_name} ${lead.last_name}`,
  
  // Contact preferences
  primaryPhone: lead.phones.find(p => p.isPrimary),
  preferredContact: lead.custom_data.preferredContactMethod,
  
  // Property search
  searchingFor: lead.custom_data.propertyType,
  budget: `$${lead.custom_data.priceMin}-${lead.custom_data.priceMax}`,
  timeline: lead.custom_data.timeline,
  areas: lead.custom_data.areasOfInterest,
  
  // Status
  stage: lead.stage,
  temperature: lead.temperature,
  lastContact: lead.lastActivity,
  
  // Relationship
  agent: lead.assignedUser?.name,
  source: lead.source,
  tags: lead.tags
}
```

## Best Practices

### 1. Field Retrieval
- Always use `fields=allFields` when fetching individual leads
- Cache complete lead data in `fub_data` JSONB field
- Update incrementally on subsequent syncs

### 2. Phone Number Handling
- Store all phones in array format
- Normalize primary phone to E.164 for matching
- Keep original formatting in array for display

### 3. Custom Fields
- Dynamically fetch custom field definitions on startup
- Map custom fields by `name` not `label`
- Store all custom fields even if not immediately used

### 4. Message Logging
- Log every message (inbound and outbound) to FUB
- Include proper from/to numbers for threading
- Add user attribution when available

### 5. Sync Strategy
- Full sync on first encounter
- Incremental updates via webhooks or polling
- Store last sync timestamp
- Keep raw FUB response for debugging

## Implementation Priority

1. **Phase 1**: Capture all standard fields (names, phones, emails, tags)
2. **Phase 2**: Add custom fields for property preferences
3. **Phase 3**: Implement full conversation logging
4. **Phase 4**: Add event tracking for lead activity
5. **Phase 5**: Implement webhook updates for real-time sync

## Testing Endpoints

Test with these curl commands (replace with your credentials):

```bash
# Get lead with all fields
curl -u YOUR_API_KEY: \
  -H "X-System: YOUR_SYSTEM" \
  -H "X-System-Key: YOUR_KEY" \
  "https://api.followupboss.com/v1/people/639?fields=allFields"

# Log a text message
curl -X POST -u YOUR_API_KEY: \
  -H "X-System: YOUR_SYSTEM" \
  -H "X-System-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"personId": 639, "message": "Test", "fromNumber": "+17068184445", "toNumber": "+18662981158"}' \
  "https://api.followupboss.com/v1/textMessages"
```

## Notes

- FUB API has rate limits - implement exponential backoff
- Some fields may be account-specific - test with actual data
- Custom fields vary by account - discover dynamically
- Text messages API is log-only (doesn't send actual SMS)
- Events API is preferred for lead creation/updates