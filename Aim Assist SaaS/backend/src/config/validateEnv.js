/**
 * Environment Variable Validator
 * Checks required environment variables on startup
 * Provides clear error messages for missing configuration
 */

/**
 * Required environment variables by category
 */
const REQUIRED_VARS = {
  database: {
    SUPABASE_URL: 'Supabase project URL (https://xxx.supabase.co)',
    SUPABASE_ANON_KEY: 'Supabase anonymous/public key'
  },
  authentication: {
    JWT_SECRET: 'Secret key for JWT token signing (generate with: openssl rand -base64 32)'
  },
  ai: {
    // At least one AI provider must be configured
    optional: ['CLAUDE_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'],
    description: 'At least one AI provider API key (Claude, Gemini, or OpenAI)'
  },
  sms: {
    TWILIO_ACCOUNT_SID: 'Twilio account SID (from console.twilio.com)',
    TWILIO_AUTH_TOKEN: 'Twilio auth token (from console.twilio.com)',
    TWILIO_FROM_NUMBER: 'Twilio phone number (format: +1XXXXXXXXXX)'
  }
};

/**
 * Optional but recommended environment variables
 */
const OPTIONAL_VARS = {
  general: {
    PORT: 'Server port (default: 3001)',
    NODE_ENV: 'Environment (development/staging/production)',
    FRONTEND_URL: 'Frontend URL for CORS (default: http://localhost:3000)'
  },
  monitoring: {
    SENTRY_DSN: 'Sentry error tracking DSN',
    LOG_LEVEL: 'Logging level (error/warn/info/debug)'
  },
  notifications: {
    AGENT_NOTIFICATION_PHONE: 'Phone number for agent notifications',
    USER_NOTIFICATION_PHONE: 'Backup phone for notifications'
  },
  testing: {
    ALLOW_TEST_AUTH: 'Enable test authentication in development (true/false)',
    TEST_USER_ID: 'Test user ID for development',
    TEST_ORG_ID: 'Test organization ID for development',
    TEST_LEAD_PHONE: 'Test lead phone number'
  }
};

/**
 * Validate all required environment variables
 */
function validateEnvironment() {
  const errors = [];
  const warnings = [];
  
  // Check required database variables
  for (const [key, description] of Object.entries(REQUIRED_VARS.database)) {
    if (!process.env[key]) {
      errors.push(`❌ Missing ${key}: ${description}`);
    }
  }
  
  // Check required authentication variables
  for (const [key, description] of Object.entries(REQUIRED_VARS.authentication)) {
    if (!process.env[key]) {
      errors.push(`❌ Missing ${key}: ${description}`);
    }
  }
  
  // Check at least one AI provider is configured
  const hasAIProvider = REQUIRED_VARS.ai.optional.some(key => process.env[key]);
  if (!hasAIProvider) {
    errors.push(`❌ Missing AI provider: ${REQUIRED_VARS.ai.description}`);
    errors.push(`   Configure one of: ${REQUIRED_VARS.ai.optional.join(', ')}`);
  }
  
  // Check SMS configuration (warning only in development)
  for (const [key, description] of Object.entries(REQUIRED_VARS.sms)) {
    if (!process.env[key]) {
      if (process.env.NODE_ENV === 'development') {
        warnings.push(`⚠️  Missing ${key}: ${description} (SMS features disabled)`);
      } else {
        errors.push(`❌ Missing ${key}: ${description}`);
      }
    }
  }
  
  // Check optional variables and provide helpful warnings
  if (!process.env.NODE_ENV) {
    warnings.push('⚠️  NODE_ENV not set - defaulting to development');
  }
  
  if (!process.env.PORT) {
    warnings.push('⚠️  PORT not set - defaulting to 3001');
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SENTRY_DSN) {
      warnings.push('⚠️  SENTRY_DSN not set - error tracking disabled');
    }
    if (!process.env.LOG_LEVEL) {
      warnings.push('⚠️  LOG_LEVEL not set - defaulting to info');
    }
  }
  
  // Print results
  if (warnings.length > 0) {
    console.log('\n🔔 Environment Warnings:');
    warnings.forEach(warning => console.log(warning));
  }
  
  if (errors.length > 0) {
    console.error('\n🚨 Environment Configuration Errors:');
    errors.forEach(error => console.error(error));
    console.error('\n📋 Required Environment Variables:');
    console.error('Create a .env file in the backend directory with these variables.');
    console.error('\nExample .env file:');
    console.error('=====================================');
    console.error('# Database');
    console.error('SUPABASE_URL=https://xxx.supabase.co');
    console.error('SUPABASE_ANON_KEY=your_anon_key_here');
    console.error('');
    console.error('# Authentication');
    console.error('JWT_SECRET=your_secret_key_here');
    console.error('');
    console.error('# AI Provider (at least one)');
    console.error('CLAUDE_API_KEY=your_claude_key');
    console.error('# GEMINI_API_KEY=your_gemini_key');
    console.error('# OPENAI_API_KEY=your_openai_key');
    console.error('');
    console.error('# SMS (Twilio)');
    console.error('TWILIO_ACCOUNT_SID=your_account_sid');
    console.error('TWILIO_AUTH_TOKEN=your_auth_token');
    console.error('TWILIO_FROM_NUMBER=+1XXXXXXXXXX');
    console.error('=====================================\n');
    
    // Exit with error code
    process.exit(1);
  }
  
  // Success message
  console.log('✅ Environment validation passed');
  
  // Return validation results
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config: {
      hasDatabase: !!process.env.SUPABASE_URL,
      hasAuth: !!process.env.JWT_SECRET,
      hasAI: hasAIProvider,
      hasSMS: !!process.env.TWILIO_ACCOUNT_SID,
      aiProvider: REQUIRED_VARS.ai.optional.find(key => process.env[key]) || 'none',
      environment: process.env.NODE_ENV || 'development'
    }
  };
}

/**
 * Get configuration summary
 */
function getConfigSummary() {
  const aiProvider = REQUIRED_VARS.ai.optional.find(key => process.env[key]);
  
  return {
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3001,
    database: process.env.SUPABASE_URL ? 'Configured' : 'Not configured',
    authentication: process.env.JWT_SECRET ? 'Configured' : 'Not configured',
    ai: {
      provider: aiProvider ? aiProvider.replace('_API_KEY', '').toLowerCase() : 'none',
      configured: !!aiProvider
    },
    sms: {
      configured: !!process.env.TWILIO_ACCOUNT_SID,
      phone: process.env.TWILIO_FROM_NUMBER || 'Not set'
    },
    monitoring: {
      sentry: !!process.env.SENTRY_DSN,
      logLevel: process.env.LOG_LEVEL || 'info'
    }
  };
}

module.exports = {
  validateEnvironment,
  getConfigSummary,
  REQUIRED_VARS,
  OPTIONAL_VARS
};