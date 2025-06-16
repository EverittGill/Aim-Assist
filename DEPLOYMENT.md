# Eugenia ISA - Digital Ocean App Platform Deployment Guide

## Prerequisites

1. **GitHub Repository**: Push your code to a GitHub repository
2. **Digital Ocean Account**: Sign up at digitalocean.com
3. **Environment Variables**: Have all your API keys and credentials ready

## Environment Variables Required

### Backend Environment Variables
```
# Server Configuration
NODE_ENV=production
PORT=8080

# Follow Up Boss Configuration
FUB_API_KEY=your_fub_api_key_here
FUB_X_SYSTEM=your_x_system_header
FUB_X_SYSTEM_KEY=your_x_system_key_header
FUB_USER_ID_FOR_AI=your_fub_user_id

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key
USER_AGENCY_NAME=Your Agency Name

# SMS Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Authentication Configuration
ADMIN_EMAIL=admin@youragency.com
ADMIN_PASSWORD_HASH=your_bcrypt_hashed_password
JWT_SECRET=your_long_random_jwt_secret

# Application Configuration
APP_DOMAIN=your-app-name.ondigitalocean.app
```

### Frontend Environment Variables
```
REACT_APP_API_URL=https://your-app-name-backend.ondigitalocean.app/api
REACT_APP_NODE_ENV=production
```

## Deployment Steps

### Step 1: Prepare Your Repository

1. **Create a GitHub repository** for your project
2. **Push all code** to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial deployment commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/eugenia-isa.git
   git push -u origin main
   ```

### Step 2: Digital Ocean App Platform Setup

1. **Log in** to Digital Ocean console
2. **Create a new App** from the Apps section
3. **Connect your GitHub repository**
4. **Choose the repository** containing Eugenia ISA

### Step 3: Configure Services

#### Backend Service Configuration:
- **Name**: `eugenia-backend`
- **Source Directory**: `/eugenia-backend`
- **Build Command**: `npm install`
- **Run Command**: `npm start`
- **Environment**: Node.js
- **Plan**: Basic ($5/month)

#### Frontend Service Configuration:
- **Name**: `eugenia-frontend`
- **Source Directory**: `/eugenia-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Type**: Static Site

### Step 4: Environment Variables

In the Digital Ocean App console:

1. **Navigate to Settings** → **App-Level Environment Variables**
2. **Add each environment variable** listed above
3. **Mark sensitive variables as encrypted** (API keys, passwords, secrets)

### Step 5: Custom Domains (Optional)

1. **Add your custom domain** in the Settings
2. **Update DNS records** to point to Digital Ocean
3. **SSL certificates** are automatically provisioned

### Step 6: Deploy

1. **Click Deploy** to start the deployment
2. **Monitor build logs** for any issues
3. **Test the application** once deployment completes

## Post-Deployment Configuration

### Update Frontend API URL

Ensure your frontend is pointing to the correct backend URL:
```javascript
// In src/services/apiService.js
const BACKEND_API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-app-name-backend.ondigitalocean.app/api';
```

### Test Authentication

1. **Access your app** at the provided URL
2. **Login with admin credentials**
3. **Verify all features work** (lead management, AI responses, etc.)

### Configure Twilio Webhooks

Update your Twilio webhook URL to point to your deployed backend:
```
https://your-app-name-backend.ondigitalocean.app/webhook/twilio-sms
```

## Monitoring and Maintenance

### App Logs
- **View logs** in Digital Ocean console under Runtime Logs
- **Monitor performance** in the Insights tab
- **Set up alerts** for downtime or errors

### Updates
- **Push to GitHub** main branch to trigger automatic redeployment
- **Monitor deployment status** in the console
- **Rollback if needed** using previous deployments

## Troubleshooting

### Common Issues:

1. **Build Failures**: Check package.json and dependencies
2. **Environment Variables**: Verify all required vars are set
3. **API Errors**: Check backend logs for detailed error messages
4. **CORS Issues**: Ensure frontend URL is in CORS configuration

### Support Resources:
- Digital Ocean App Platform Documentation
- Digital Ocean Community Forums
- GitHub Issues for this project

## Security Notes

- **Never commit secrets** to GitHub
- **Use environment variables** for all sensitive data
- **Regularly rotate** API keys and passwords
- **Monitor access logs** for suspicious activity
- **Keep dependencies updated** for security patches