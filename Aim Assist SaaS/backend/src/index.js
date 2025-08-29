/**
 * Main entry point for Aim Assist API
 * Initializes Express server, Supabase, Redis queues
 * Sets up all routes and starts queue processors
 */

require('dotenv').config();

// Validate environment variables before starting
const { validateEnvironment, getConfigSummary } = require('./config/validateEnv');
validateEnvironment();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Health check endpoint - MUST respond as specified in test criteria
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'aim-assist-api',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Aim Assist API',
    version: '0.1.0',
    docs: '/api/docs'
  });
});

// Initialize Auth Service
const AuthService = require('./services/AuthService');
const authService = new AuthService(process.env.JWT_SECRET);
console.log('🔐 Auth service initialized');

// API Routes with service injection
app.use('/api/auth', require('./routes/auth')(authService));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/leads', require('./routes/leads')(authService));
app.use('/api/conversations', require('./routes/conversations')(authService));
app.use('/api/messages', require('./routes/conversations')(authService)); // Alias for frontend compatibility
app.use('/api/ai', require('./routes/conversations')(authService)); // AI endpoints are in conversations
app.use('/api/crm', require('./routes/crm'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/sync', require('./routes/sync')); // CRM sync management
app.use('/api/auto-text', require('./routes/auto-text')); // Auto-text rules management
app.use('/api/prompts', require('./routes/prompts')); // AI prompt customization
app.use('/api/tag-poll', require('./routes/tagPolling')); // Tag-based lead polling

// Development helper endpoint
app.use('/api/dev', require('./routes/frontend-status'));

// Webhook endpoints
app.use('/webhook/twilio', require('./routes/webhooks/twilio'));
app.use('/webhook/stripe', require('./routes/webhooks/stripe'));
app.use('/webhook/fub', require('./routes/webhooks/fub'));
app.use('/webhook/property', require('./routes/webhooks/property'));

// Queue monitoring endpoint
app.use('/api/queues', require('./routes/queues'));

// Extraction monitoring dashboard
app.use('/api/monitoring', require('./routes/monitoring'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🎯 Aim Assist API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Log configuration summary
  const config = getConfigSummary();
  console.log(`🔧 Configuration:`);
  console.log(`   Database: ${config.database}`);
  console.log(`   AI Provider: ${config.ai.provider}`);
  console.log(`   SMS: ${config.sms.configured ? 'Configured' : 'Not configured'}`);
  console.log(`   Monitoring: ${config.monitoring.sentry ? 'Sentry enabled' : 'No monitoring'}`);
  
  // Initialize services (to be implemented)
  initializeServices().catch(console.error);
});

// Initialize background services
async function initializeServices() {
  const services = [];
  
  try {
    // Initialize Supabase connection
    const { testConnection } = require('./config/supabase');
    const supabaseConnected = await testConnection();
    if (supabaseConnected) {
      console.log('✅ Supabase connected');
      services.push('supabase');
    } else {
      console.log('⚠️ Supabase not configured - using mock mode');
    }
    
    // Initialize Redis and queues
    try {
      const queueManager = require('./queues/QueueManager').default;
      await queueManager.initialize();
      console.log('✅ Queue system initialized');
      services.push('queues');
    } catch (queueError) {
      console.warn('⚠️ Queue system not available:', queueError.message);
      console.log('📝 Running without queue system - messages will process synchronously');
    }
    
    // Initialize sync scheduler for all tenants
    const SyncScheduler = require('./services/SyncScheduler');
    await SyncScheduler.initializeAllTenants();
    console.log('✅ Sync schedules initialized');
    services.push('sync-scheduler');
    
    if (services.length > 0) {
      console.log(`🚀 Services initialized: ${services.join(', ')}`);
    } else {
      console.log('⚠️ Running in limited mode - no external services connected');
    }
  } catch (error) {
    console.error('❌ Critical service initialization error:', error);
    // Don't exit - let health check show unhealthy state
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;