// Sentry initialization - must be imported first in server.js
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions in development
  
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
  
  // Release tracking
  release: process.env.npm_package_version,
  
  // Better error context
  attachStacktrace: true,
  
  // Don't send default PII in production
  sendDefaultPii: process.env.NODE_ENV === 'development',
  
  // Integrations
  integrations: [
    // Include default integrations
    ...Sentry.getDefaultIntegrations({}),
  ],
  
  // Before sending an error to Sentry
  beforeSend(event, hint) {
    // Don't send errors in test environment
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    
    // Filter out non-critical errors
    if (event.exception) {
      const error = hint.originalException;
      // Skip DNS errors which are usually transient
      if (error?.code === 'ENOTFOUND') {
        return null;
      }
    }
    
    return event;
  },
});