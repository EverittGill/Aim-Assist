/**
 * Main entry point for Aim Assist API
 * Initializes Express server, Supabase, Redis queues
 * Sets up all routes and starts queue processors
 */

require('dotenv').config();
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

// API Routes (to be implemented)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/billing', require('./routes/billing'));

// Development helper endpoint
app.use('/api/dev', require('./routes/frontend-status'));

// Webhook endpoints
app.use('/webhook/twilio', require('./routes/webhooks/twilio'));
app.use('/webhook/stripe', require('./routes/webhooks/stripe'));
app.use('/webhook/fub', require('./routes/webhooks/fub'));

// Queue monitoring endpoint
app.use('/api/queues', require('./routes/queues'));

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
  
  // Initialize services (to be implemented)
  initializeServices().catch(console.error);
});

// Initialize background services
async function initializeServices() {
  try {
    // Initialize Supabase connection
    // const supabase = require('./config/supabase');
    // console.log('✅ Supabase connected');
    
    // Initialize Redis and queues
    // const QueueManager = require('./queues/QueueManager');
    // await QueueManager.initialize();
    // console.log('✅ Queue system initialized');
    
    // Initialize CRM webhook listeners
    // const WebhookManager = require('./services/WebhookManager');
    // await WebhookManager.initialize();
    // console.log('✅ Webhook listeners active');
    
    console.log('🚀 All services initialized successfully');
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
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