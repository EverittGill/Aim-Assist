# Follow Up Boss System Registration Documentation

## Overview
System registration is required for external integrations that will access multiple Follow Up Boss accounts or need to use restricted endpoints like `/textMessages` and webhooks.

## Why System Registration is Required

### For External Service Providers
If you're building a service that will be used by multiple FUB customers:
- Each integration needs unique X-System credentials
- Prevents conflicts between different service providers
- Enables FUB to track usage and provide support
- Required for webhook verification and restricted endpoints

### For Single Account Use
Even single-account integrations benefit from registration:
- Access to restricted endpoints (textMessages, webhooks)
- Better error tracking and support
- Future-proofing for additional features

## Registration Process

### 1. Contact Follow Up Boss Support
Email: **support@followupboss.com**

### 2. Provide Integration Details
Include the following information in your registration request:

```
Subject: System Registration Request - [Your Integration Name]

Dear Follow Up Boss Team,

I am requesting system registration for our integration:

Integration Name: Eugenia ISA (Inside Sales Agent)
Description: AI-powered lead nurturing system with SMS automation
Developer: [Your Name/Company]
Expected Usage: 
- Text message logging via API
- Webhook subscriptions for real-time SMS
- Lead management and conversation tracking
- Target: [X] customers using the system

Technical Details:
- Will use textMessages endpoint for SMS logging
- Needs webhook subscriptions for textMessagesCreated events
- Authentication via individual customer API keys
- Approximately [X] API calls per customer per day

Please provide X-System and X-System-Key credentials.

Thank you,
[Your Name]
```

### 3. Receive Credentials
FUB will provide:
- **X-System**: Your unique system identifier (e.g., "EugeniaISA")
- **X-System-Key**: Secret key for webhook verification and authentication

## Implementation After Registration

### 1. Store Credentials Securely
```bash
# Add to .env file
FUB_X_SYSTEM=EugeniaISA
FUB_X_SYSTEM_KEY=your_unique_system_key_here
```

### 2. Include Headers in All Requests
```javascript
const fubAPIHeaders = {
  'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
  'X-System': process.env.FUB_X_SYSTEM,
  'X-System-Key': process.env.FUB_X_SYSTEM_KEY,
  'Content-Type': 'application/json'
};
```

### 3. Create FUB Client with System Headers
```javascript
class FUBClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.followupboss.com/v1';
    
    if (!process.env.FUB_X_SYSTEM || !process.env.FUB_X_SYSTEM_KEY) {
      throw new Error('FUB system registration credentials missing');
    }
  }
  
  getHeaders() {
    return {
      'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      'X-System': process.env.FUB_X_SYSTEM,
      'X-System-Key': process.env.FUB_X_SYSTEM_KEY,
      'Content-Type': 'application/json'
    };
  }
  
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : null
    };
    
    const response = await fetch(`${this.baseURL}${endpoint}`, options);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`FUB API Error: ${error.message || response.statusText}`);
    }
    
    return response.json();
  }
}
```

## Webhook Registration

### Prerequisites
- System must be registered with FUB
- Webhook endpoint must use HTTPS
- Only account owners can create webhooks

### Webhook Creation Request
```javascript
async function registerWebhook(apiKey, webhookUrl, events) {
  const fubClient = new FUBClient(apiKey);
  
  const webhookPayload = {
    url: webhookUrl, // Must be HTTPS
    events: events,  // ['textMessagesCreated', 'textMessagesUpdated']
    active: true
  };
  
  try {
    const response = await fubClient.request('POST', '/webhooks', webhookPayload);
    console.log('Webhook registered:', response);
    return response;
  } catch (error) {
    console.error('Webhook registration failed:', error);
    throw error;
  }
}
```

### Example Webhook Registration
```javascript
// Register webhook for SMS events
await registerWebhook(
  customerAPIKey,
  'https://eugenia.yourdomain.com/webhook/fub-sms',
  ['textMessagesCreated', 'textMessagesUpdated']
);
```

## Verification and Testing

### 1. Test System Headers
```javascript
async function testSystemRegistration(apiKey) {
  const fubClient = new FUBClient(apiKey);
  
  try {
    // Test basic API access
    const users = await fubClient.request('GET', '/users/me');
    console.log('✅ Basic API access working');
    
    // Test restricted endpoint (requires system registration)
    const textMessages = await fubClient.request('GET', '/textMessages?limit=1');
    console.log('✅ System registration verified - textMessages endpoint accessible');
    
    return true;
  } catch (error) {
    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      console.error('❌ System registration issue:', error.message);
      return false;
    }
    throw error;
  }
}
```

### 2. Test Webhook Signature Verification
```javascript
function testWebhookSignature() {
  const testPayload = {
    eventId: "test-123",
    event: "textMessagesCreated",
    resourceIds: ["msg-456"]
  };
  
  const base64Payload = Buffer.from(JSON.stringify(testPayload)).toString('base64');
  const expectedSignature = crypto
    .createHmac('sha256', process.env.FUB_X_SYSTEM_KEY)
    .update(base64Payload)
    .digest('hex');
  
  console.log('Test payload:', testPayload);
  console.log('Expected signature:', expectedSignature);
  
  // Use this to verify webhook signatures are working
  return expectedSignature;
}
```

## Multi-Customer Implementation

### Customer Setup Flow
```javascript
class EugeniaCustomerService {
  constructor() {
    this.customers = new Map(); // Store customer configurations
  }
  
  async setupCustomer(customerId, customerConfig) {
    const { fubAPIKey, webhookUrl } = customerConfig;
    
    // 1. Validate FUB API access
    const fubClient = new FUBClient(fubAPIKey);
    await this.validateCustomerFUB(fubClient);
    
    // 2. Register webhooks
    await this.setupCustomerWebhooks(fubClient, webhookUrl);
    
    // 3. Store customer configuration
    this.customers.set(customerId, {
      fubClient,
      webhookUrl,
      setupDate: new Date()
    });
    
    console.log(`✅ Customer ${customerId} setup complete`);
  }
  
  async validateCustomerFUB(fubClient) {
    try {
      const user = await fubClient.request('GET', '/users/me');
      console.log(`Validated FUB access for: ${user.name}`);
      return true;
    } catch (error) {
      throw new Error(`FUB validation failed: ${error.message}`);
    }
  }
  
  async setupCustomerWebhooks(fubClient, webhookUrl) {
    const webhooks = [
      {
        url: `${webhookUrl}/textMessages`,
        events: ['textMessagesCreated', 'textMessagesUpdated']
      }
    ];
    
    for (const webhook of webhooks) {
      await fubClient.request('POST', '/webhooks', webhook);
      console.log(`Webhook registered: ${webhook.url}`);
    }
  }
  
  getFUBClient(customerId) {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    return customer.fubClient;
  }
}
```

## Environment Variables Setup

### Required Variables
```bash
# System Registration (Same for all customers)
FUB_X_SYSTEM=EugeniaISA
FUB_X_SYSTEM_KEY=your_system_key_here

# Customer-specific (Multiple customers)
FUB_API_KEY_CUSTOMER_1=customer1_api_key
FUB_API_KEY_CUSTOMER_2=customer2_api_key

# Or for single customer
FUB_API_KEY=single_customer_api_key
```

### Configuration Validation
```javascript
function validateFUBConfiguration() {
  const required = ['FUB_X_SYSTEM', 'FUB_X_SYSTEM_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing FUB system configuration: ${missing.join(', ')}`);
  }
  
  console.log('✅ FUB system configuration validated');
}

// Run on startup
validateFUBConfiguration();
```

## Common Registration Issues

### 1. System Not Registered
**Error**: `Unauthorized` when accessing `/textMessages`
**Solution**: Complete system registration process with FUB support

### 2. Wrong System Headers
**Error**: `Invalid system credentials`
**Solution**: 
- Verify X-System and X-System-Key are correct
- Check for typos in environment variables
- Ensure headers are included in ALL requests

### 3. Webhook Registration Fails
**Error**: `Insufficient permissions` or `Forbidden`
**Solutions**:
- Ensure API key belongs to account owner
- Verify webhook URL uses HTTPS
- Check system is properly registered

### 4. Signature Verification Fails
**Error**: Webhook signatures don't match
**Solutions**:
- Verify X-System-Key is correct
- Check base64 encoding of payload
- Ensure SHA256 HMAC calculation is correct

## Support and Troubleshooting

### Contact Information
- **Email**: support@followupboss.com
- **Subject**: Include "System Registration" or your X-System name
- **Include**: Error messages, API requests, and system details

### Debugging Steps
1. Verify environment variables are loaded
2. Test basic API access without system headers
3. Test system endpoints with headers
4. Check webhook signature calculation
5. Review FUB API logs if available

### Logging Best Practices
```javascript
function logFUBRequest(method, endpoint, headers, response) {
  console.log(`FUB API ${method} ${endpoint}`, {
    hasSystemHeaders: !!(headers['X-System'] && headers['X-System-Key']),
    responseStatus: response.status,
    timestamp: new Date().toISOString()
  });
}
```