// eugenia-backend/server.js

// IMPORTANT: Load environment variables first, then instrument Sentry
require('dotenv').config();

// Initialize Sentry before all other imports
require('./instrument');

const Sentry = require('@sentry/node');
const express = require('express');
const cors = require('cors');
const GeminiService = require('./services/geminiService');
const ClaudeService = require('./services/claudeService');
const TwilioService = require('./services/twilioService');
const FUBService = require('./services/fubService');
const AuthService = require('./services/authService');
const ConversationService = require('./services/conversationService');
const MessageRecoveryService = require('./services/messageRecoveryService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware

// Initialize AI service (Claude or Gemini)
let aiService;
const useClaude = process.env.USE_CLAUDE === 'true';

if (useClaude && process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== 'your_claude_api_key_here') {
  try {
    aiService = new ClaudeService(process.env.CLAUDE_API_KEY);
    console.log('🤖 Claude 3.5 Sonnet service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Claude service:', error.message);
  }
} else if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_chosen_gemini_api_key_here') {
  try {
    aiService = new GeminiService(process.env.GEMINI_API_KEY);
    console.log('Gemini service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Gemini service:', error.message);
  }
} else {
  console.warn('No AI service configured - AI features will not work');
  console.warn('Set either CLAUDE_API_KEY with USE_CLAUDE=true or GEMINI_API_KEY in .env');
}

// Keep geminiService reference for backward compatibility
const geminiService = aiService;

let twilioService;
if (process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_FROM_NUMBER &&
    process.env.TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid_here') {
  try {
    twilioService = new TwilioService(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      process.env.TWILIO_FROM_NUMBER
    );
    console.log('Twilio service initialized successfully');
    console.log('📱 Twilio FROM number configured as:', process.env.TWILIO_FROM_NUMBER);
  } catch (error) {
    console.error('Failed to initialize Twilio service:', error.message);
  }
} else {
  console.warn('Twilio credentials not configured - SMS features will not work');
}

let fubService;
if (process.env.FUB_API_KEY && 
    process.env.FUB_X_SYSTEM && 
    process.env.FUB_X_SYSTEM_KEY &&
    process.env.FUB_API_KEY !== 'your_fub_api_key_here') {
  try {
    fubService = new FUBService(
      process.env.FUB_API_KEY,
      process.env.FUB_X_SYSTEM,
      process.env.FUB_X_SYSTEM_KEY,
      process.env.FUB_USER_ID
    );
    console.log('FUB service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize FUB service:', error.message);
  }
} else {
  console.warn('FUB credentials not configured - FUB features will not work');
}

let conversationService;
if (fubService) {
  conversationService = new ConversationService(fubService);
  console.log('Conversation service initialized successfully');
} else {
  console.warn('Conversation service not available - FUB required');
}

let authService;
if (process.env.JWT_SECRET && process.env.ADMIN_PASSWORD_HASH) {
  try {
    authService = new AuthService(process.env.JWT_SECRET);
    console.log('Auth service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Auth service:', error.message);
  }
} else {
  console.warn('Authentication not configured - auth features will not work');
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Hello from the Eugenia ISA Backend! The server is running.');
});

// Initialize queues
const { initializeQueues, queues, getQueueStats } = require('./config/queues');
initializeQueues();

// Initialize queue processors if services are available
if (queues?.smsQueue && twilioService) {
  const { createSmsProcessor, createLeadProcessor } = require('./workers/smsProcessor');
  
  // Process SMS jobs
  queues.smsQueue.process('send-sms', 5, createSmsProcessor(twilioService, fubService));
  
  // Process lead outreach jobs
  if (geminiService && fubService) {
    queues.leadQueue.process('process-lead', 2, createLeadProcessor(geminiService, twilioService, fubService));
  }
  
  console.log('Queue processors initialized');
}

// Mount route modules
const routes = require('./routes')({
  authService,
  fubService,
  conversationService,
  geminiService,
  twilioService
});

app.use('/api/auth', routes.auth);
app.use('/api/leads', routes.leads);
app.use('/api', routes.ai);
app.use('/webhook', routes.webhooks);
app.use('/api/prompts', routes.prompts);
app.use('/api/dev-mode', routes.devMode);

// Debug route for testing Sentry
app.get('/debug-sentry', function mainHandler(req, res) {
  throw new Error('My first Sentry error from Eugenia ISA!');
});

// Queue monitoring endpoint
app.get('/api/queues/stats', async (req, res) => {
  if (!queues?.smsQueue) {
    return res.json({ message: 'Queues not available' });
  }
  
  try {
    const smsStats = await getQueueStats(queues.smsQueue);
    const leadStats = await getQueueStats(queues.leadQueue);
    
    res.json({
      sms: smsStats,
      leads: leadStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Initialize DEV mode for test lead
const devModeService = require('./services/devModeService');
// Dev mode is auto-enabled for lead 470 in the service constructor

// Initialize message recovery service
let messageRecoveryService;
if (twilioService && fubService && geminiService && conversationService) {
  messageRecoveryService = new MessageRecoveryService(
    twilioService,
    fubService,
    geminiService,
    conversationService
  );
  
  // Start periodic recovery (check every 5 minutes)
  messageRecoveryService.startPeriodicRecovery(5);
  console.log('📨 Message recovery service initialized');
} else {
  console.warn('⚠️  Message recovery service not started - missing required services');
}

// Manual recovery endpoint for testing
app.post('/api/recover-messages', async (req, res) => {
  if (!messageRecoveryService) {
    return res.status(503).json({ error: 'Message recovery service not available' });
  }
  
  try {
    const { lookbackMinutes = 60 } = req.body;
    const results = await messageRecoveryService.recoverMissedMessages(lookbackMinutes);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Manual recovery failed:', error);
    res.status(500).json({ error: 'Recovery failed', message: error.message });
  }
});

// Custom error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  const errorId = res.sentry;
  
  res.status(500).json({ 
    error: 'Internal server error',
    errorId: errorId,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Eugenia Backend server is running on http://localhost:${PORT}`);
  console.log(`Queue monitoring available at http://localhost:${PORT}/api/queues/stats`);
});