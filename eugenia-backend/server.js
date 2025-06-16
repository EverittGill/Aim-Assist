// eugenia-backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const GeminiService = require('./services/geminiService');
const TwilioService = require('./services/twilioService');
const FUBService = require('./services/fubService');
const AuthService = require('./services/authService');
const ConversationService = require('./services/conversationService');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
let geminiService;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_chosen_gemini_api_key_here') {
  try {
    geminiService = new GeminiService(process.env.GEMINI_API_KEY);
    console.log('Gemini service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Gemini service:', error.message);
  }
} else {
  console.warn('Gemini API key not configured - AI features will not work');
}

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

app.listen(PORT, () => {
  console.log(`Eugenia Backend server is running on http://localhost:${PORT}`);
});