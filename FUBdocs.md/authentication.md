# Follow Up Boss Authentication Documentation

## Overview
Follow Up Boss uses HTTP Basic Authentication over HTTPS for API access. Every user has a unique API key that provides the same privileges as their login credentials.

## Authentication Methods

### 1. Basic Authentication (API Key)
The primary authentication method for server-to-server integration.

#### Setup
1. Obtain API Key from FUB:
   - Login to Follow Up Boss
   - Navigate to Admin → API
   - Copy your unique API key

2. Format for requests:
   - Username: Your API key
   - Password: Leave blank (or any value if required)

#### Implementation

##### Using Authorization Header
```javascript
const apiKey = process.env.FUB_API_KEY;
const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');

const response = await fetch('https://api.followupboss.com/v1/people', {
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  }
});
```

##### Using Axios
```javascript
const axios = require('axios');

const fubAPI = axios.create({
  baseURL: 'https://api.followupboss.com/v1',
  auth: {
    username: process.env.FUB_API_KEY,
    password: '' // Leave blank
  },
  headers: {
    'Content-Type': 'application/json'
  }
});
```

##### Using curl
```bash
curl -u "YOUR_API_KEY:" https://api.followupboss.com/v1/people
# OR
curl -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
     https://api.followupboss.com/v1/people
```

### 2. OAuth Authentication
For applications that need to access multiple FUB accounts or provide a seamless user experience.

#### OAuth Flow
1. Register your application with FUB
2. Redirect users to FUB authorization endpoint
3. Handle callback with authorization code
4. Exchange code for access token
5. Use token for API requests

*Note: OAuth setup requires contacting FUB support for app registration*

## System Registration Headers

### Required Headers for External Systems
If you're building an integration that will be used by multiple FUB accounts:

```http
X-System: YourSystemName
X-System-Key: YourSystemKey
```

#### Registration Process
1. Contact support@followupboss.com
2. Provide:
   - System name
   - Description of integration
   - Expected usage volume
3. Receive X-System and X-System-Key credentials

#### Implementation with System Headers
```javascript
const headers = {
  'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
  'X-System': process.env.FUB_X_SYSTEM,
  'X-System-Key': process.env.FUB_X_SYSTEM_KEY,
  'Content-Type': 'application/json'
};
```

## Security Requirements

### HTTPS Only
- All API requests must use HTTPS
- HTTP requests will be rejected
- Ensures API keys are encrypted in transit

### API Key Security
- **Never expose API keys in client-side code**
- Store in environment variables
- Rotate keys periodically
- Each key has full user privileges

### Environment Variables Setup
```bash
# .env file
FUB_API_KEY=your_api_key_here
FUB_X_SYSTEM=YourSystemName
FUB_X_SYSTEM_KEY=your_system_key_here
```

## Permission Levels

API access mirrors user permission levels in FUB:

### Owner
- Full access to all resources
- Can create/manage webhooks
- Access to all contacts and data

### Admin
- Access to most resources
- Cannot manage webhooks
- Can access all contacts

### Agent
- Limited to assigned contacts
- Can only see/modify own leads
- Restricted access to reports

### Lender
- Very limited access
- Only assigned contacts
- Read-only for most resources

## Error Handling

### Common Authentication Errors

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```
**Solutions:**
- Verify API key is correct
- Check Authorization header format
- Ensure HTTPS is used

#### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```
**Solutions:**
- Check user permission level
- Verify access to requested resource
- Contact account owner for access

### Implementation Example
```javascript
async function makeAuthenticatedRequest(endpoint, options = {}) {
  try {
    const response = await fubAPI.get(endpoint, options);
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('Authentication failed. Check API key.');
      throw new Error('Invalid FUB credentials');
    } else if (error.response?.status === 403) {
      console.error('Insufficient permissions for this operation.');
      throw new Error('Access denied');
    }
    throw error;
  }
}
```

## Best Practices

### 1. Secure Storage
```javascript
// Use environment variables
const apiKey = process.env.FUB_API_KEY;

// Never do this:
// const apiKey = 'abc123...'; // Hardcoded key
```

### 2. Request Wrapper
Create a centralized authentication wrapper:
```javascript
class FUBClient {
  constructor() {
    this.apiKey = process.env.FUB_API_KEY;
    this.baseURL = 'https://api.followupboss.com/v1';
    
    if (!this.apiKey) {
      throw new Error('FUB_API_KEY environment variable is required');
    }
  }
  
  getAuthHeaders() {
    return {
      'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      'X-System': process.env.FUB_X_SYSTEM || '',
      'X-System-Key': process.env.FUB_X_SYSTEM_KEY || '',
      'Content-Type': 'application/json'
    };
  }
  
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : null
    };
    
    const response = await fetch(`${this.baseURL}${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`FUB API Error: ${error.message || response.statusText}`);
    }
    
    return response.json();
  }
}
```

### 3. Token Refresh Strategy
For OAuth implementations:
```javascript
async function getValidToken() {
  if (tokenIsExpired()) {
    const newToken = await refreshToken();
    saveToken(newToken);
    return newToken;
  }
  return getCurrentToken();
}
```

### 4. Rate Limiting Awareness
While FUB doesn't publish specific rate limits:
- Implement exponential backoff
- Cache frequently accessed data
- Batch operations when possible

## Testing Authentication

### Quick Test Script
```javascript
// test-auth.js
require('dotenv').config();

async function testFUBAuth() {
  const apiKey = process.env.FUB_API_KEY;
  
  if (!apiKey) {
    console.error('❌ FUB_API_KEY not found in environment');
    return;
  }
  
  try {
    const response = await fetch('https://api.followupboss.com/v1/users/me', {
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      console.log('✅ Authentication successful!');
      console.log(`Logged in as: ${user.name} (${user.email})`);
    } else {
      console.error('❌ Authentication failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  }
}

testFUBAuth();
```

## Troubleshooting

### API Key Not Working
1. Verify key is copied correctly (no extra spaces)
2. Check user still has active FUB access
3. Ensure using HTTPS not HTTP
4. Try regenerating key in FUB admin

### System Headers Issues
1. Confirm system is registered with FUB
2. Verify X-System-Key matches registration
3. Check headers are included in all requests
4. Contact FUB support if issues persist

### Permission Errors
1. Check user role in FUB (Owner/Admin/Agent)
2. Verify trying to access allowed resources
3. Test with owner-level API key
4. Review FUB account settings