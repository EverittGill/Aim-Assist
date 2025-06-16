// eugenia-backend/server.js

require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
const GeminiService = require('./services/geminiService');
const TwilioService = require('./services/twilioService');
const FUBService = require('./services/fubService');
const AuthService = require('./services/authService');
const ConversationService = require('./services/conversationService');
// We are using built-in fetch for Node.js v18+ (your Node v23 has it)

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Gemini Service
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

// Initialize Twilio Service
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

// Initialize FUB Service
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

// Initialize Conversation Service
let conversationService;
if (fubService) {
  conversationService = new ConversationService(fubService);
  console.log('Conversation service initialized successfully');
} else {
  console.warn('Conversation service not available - FUB required');
}

// Initialize Auth Service
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
app.use(cors()); // Enable CORS for all routes - allows your frontend to call this backend
app.use(express.json()); // To parse JSON request bodies

// Simple test route to check if the server is alive
app.get('/', (req, res) => {
  res.send('Hello from the Eugenia ISA Backend! The server is running.');
});

// --- Authentication Routes ---
app.post('/api/auth/login', async (req, res) => {
  if (!authService) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }

  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await authService.authenticateUser(email, password);
    const token = authService.generateToken(user.userId, user.email);
    
    res.json({ 
      success: true,
      token,
      user: {
        id: user.userId,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  if (!authService) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }

  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const decoded = authService.verifyToken(token);
    res.json({ 
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email
      }
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  if (!authService) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }

  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const newToken = authService.refreshToken(token);
    res.json({ 
      success: true,
      token: newToken
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Auth middleware for protecting routes
const requireAuth = authService ? authService.createAuthMiddleware() : (req, res, next) => {
  console.warn('Authentication middleware bypassed - auth service not configured');
  next();
};

// --- API Route to Fetch Leads from FUB ---
app.get('/api/leads', requireAuth, async (req, res) => {
  console.log('GET /api/leads endpoint: Attempting to fetch real leads from FUB');

  if (!fubService) {
    console.error('FUB service not configured');
    return res.status(503).json({ error: 'FUB service not configured' });
  }

  try {
    const leads = await fubService.fetchLeads();
    console.log(`Successfully fetched ${leads.length} leads from FUB.`);
    
    // Set no-cache headers on the response TO THE FRONTEND
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({ leads });
  } catch (error) {
    console.error('Error fetching leads:', error.message);
    res.status(500).json({ error: 'Failed to fetch leads from FUB', details: error.message });
  }
});

// --- API Route to Generate Initial AI Message ---
app.post('/api/generate-initial-message', requireAuth, async (req, res) => {
  if (!geminiService) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const { leadDetails, agencyName } = req.body;
  
  if (!leadDetails) {
    return res.status(400).json({ error: 'Lead details are required' });
  }

  try {
    const finalAgencyName = agencyName || process.env.USER_AGENCY_NAME || 'Our Agency';
    const message = await geminiService.generateInitialOutreach(leadDetails, finalAgencyName);
    res.json({ message });
  } catch (error) {
    console.error('Error generating initial message:', error);
    res.status(500).json({ error: 'Failed to generate AI message' });
  }
});

// --- API Route to Generate AI Reply ---
app.post('/api/generate-reply', requireAuth, async (req, res) => {
  if (!geminiService) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const { leadDetails, conversationHistory, agencyName } = req.body;
  
  if (!leadDetails || !conversationHistory) {
    return res.status(400).json({ error: 'Lead details and conversation history are required' });
  }

  try {
    const finalAgencyName = agencyName || process.env.USER_AGENCY_NAME || 'Our Agency';
    const result = await geminiService.generateConversationReply(
      leadDetails, 
      conversationHistory, 
      finalAgencyName
    );
    res.json(result);
  } catch (error) {
    console.error('Error generating reply:', error);
    res.status(500).json({ error: 'Failed to generate AI reply' });
  }
});

// --- API Route to Send AI Message via SMS ---
app.post('/api/send-ai-message', requireAuth, async (req, res) => {
  // SAFETY CHECK: Prevent accidental SMS to production leads
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PRODUCTION_SMS) {
    return res.status(403).json({ error: 'SMS disabled in production for lead safety' });
  }
  
  if (!twilioService) {
    return res.status(503).json({ error: 'SMS service not configured' });
  }

  const { leadId, message, senderName, leadPhoneNumber } = req.body;
  
  if (!leadId || !message || !leadPhoneNumber) {
    return res.status(400).json({ error: 'Lead ID, message, and phone number are required' });
  }

  try {
    // Send SMS via Twilio
    const smsResult = await twilioService.sendSMS(leadPhoneNumber, message);
    
    // Log to FUB /textMessages endpoint if FUB service is available
    if (fubService) {
      try {
        const logResult = await fubService.logTextMessage(
          leadId, 
          message, 
          'outbound', 
          process.env.TWILIO_FROM_NUMBER,
          leadPhoneNumber
        );
        
        if (logResult.id === 'skipped') {
          console.log(`Skipped FUB SMS logging for lead ${leadId}: ${logResult.reason}`);
        } else {
          console.log(`Successfully logged outbound SMS to FUB for lead ${leadId}`);
        }
      } catch (fubError) {
        console.error('Failed to log SMS to FUB:', fubError.message);
        // Continue even if FUB logging fails
      }
    }
    
    // TODO: Update Airtable backup
    
    res.json({ 
      success: true,
      message: 'SMS sent successfully',
      twilioSid: smsResult.messageSid 
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// --- API Route to Log Incoming Message and Generate Reply ---
app.post('/api/log-incoming-message', requireAuth, async (req, res) => {
  const { leadId, leadName, message, currentConversation, leadPhoneNumber } = req.body;
  
  if (!leadId || !message || !currentConversation) {
    return res.status(400).json({ error: 'Lead ID, message, and conversation history are required' });
  }

  try {
    // Log incoming message to FUB if service is available
    if (fubService) {
      try {
        const logResult = await fubService.logTextMessage(
          leadId, 
          message, 
          'inbound', 
          leadPhoneNumber,
          process.env.TWILIO_FROM_NUMBER
        );
        
        if (logResult.id === 'skipped') {
          console.log(`Skipped FUB SMS logging for lead ${leadId}: ${logResult.reason}`);
        } else {
          console.log(`Successfully logged inbound SMS to FUB for lead ${leadId}`);
        }
      } catch (fubError) {
        console.error('Failed to log incoming SMS to FUB:', fubError.message);
        // Continue even if FUB logging fails
      }
    }
    
    // TODO: Update Airtable backup
    
    // Generate AI response with FULL context if Gemini is available
    let aiMessage = null;
    let shouldAutoPause = false;
    if (geminiService) {
      try {
        console.log(`🧠 Building complete context for lead ${leadId}...`);
        
        let contextToUse = currentConversation; // Default to frontend history
        let leadContext = null;
        
        // Try to get FUB context, but use frontend as fallback
        if (conversationService) {
          try {
            const fullContext = await conversationService.buildCompleteContext(leadId, message);
            leadContext = fullContext.leadContext;
            
            if (fullContext.conversationHistory.length > 0) {
              console.log(`📚 Using FUB history: ${fullContext.conversationHistory.length} messages`);
              contextToUse = fullContext.conversationHistory;
            } else {
              console.log(`📱 Using frontend history: ${currentConversation.length} messages (FUB empty)`);
            }
          } catch (fubError) {
            console.log(`⚠️ FUB context failed, using frontend: ${currentConversation.length} messages`);
          }
        }
        
        console.log(`🎯 Final context: ${contextToUse.length} messages for lead ${leadName}`);
        
        const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
        const result = await geminiService.generateConversationReply(
          { id: leadId, name: leadName }, 
          contextToUse, // Use best available context
          agencyName,
          leadContext // Pass lead profile if available
        );
        
        aiMessage = result.message;
        shouldAutoPause = result.shouldAutoPause;
        
        console.log(`🤖 Generated AI response: "${aiMessage.substring(0, 50)}..."`);
        
        // Check if we should auto-pause
        if (shouldAutoPause && fubService) {
          try {
            await fubService.updateLeadStatus(leadId, 'AI - Paused');
            console.log(`Auto-paused lead ${leadId} in FUB due to conversation content`);
          } catch (fubError) {
            console.error('Failed to auto-pause lead in FUB:', fubError.message);
          }
        }
      } catch (contextError) {
        console.error('Error building conversation context:', contextError);
        // Final fallback to basic conversation
        const leadDetails = { id: leadId, name: leadName };
        const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
        const result = await geminiService.generateConversationReply(
          leadDetails, 
          currentConversation, 
          agencyName
        );
        aiMessage = result.message;
        shouldAutoPause = result.shouldAutoPause;
      }
    }
    
    res.json({ 
      success: true,
      aiMessage,
      shouldAutoPause,
      message: 'Incoming message logged successfully'
    });
  } catch (error) {
    console.error('Error processing incoming message:', error);
    res.status(500).json({ error: 'Failed to process incoming message' });
  }
});

// --- API Route to Process New Leads for AI Outreach ---
app.post('/api/initiate-ai-outreach', requireAuth, async (req, res) => {
  try {
    // TODO: Identify new leads without Eugenia URL custom field
    // TODO: Generate initial messages
    // TODO: Send via Twilio
    // TODO: Update FUB with Eugenia URL
    // TODO: Log to Airtable
    
    res.json({ 
      success: true,
      message: 'New lead processing initiated (implementation pending)'
    });
  } catch (error) {
    console.error('Error processing new leads:', error);
    res.status(500).json({ error: 'Failed to process new leads' });
  }
});

// --- Twilio Webhook for Incoming SMS ---
app.post('/webhook/twilio-sms', express.raw({ type: 'application/x-www-form-urlencoded' }), (req, res) => {
  if (!twilioService) {
    return res.status(503).send('SMS service not configured');
  }

  try {
    // Parse the incoming webhook data
    const body = new URLSearchParams(req.body.toString());
    const bodyObj = Object.fromEntries(body);
    
    // TODO: Validate Twilio signature for security
    
    const incomingMessage = twilioService.parseIncomingSMS(bodyObj);
    console.log('Incoming SMS:', incomingMessage);
    
    // TODO: Process the incoming message
    // 1. Look up lead by phone number
    // 2. Log to conversation history
    // 3. Generate AI response
    // 4. Send response if not paused
    
    res.status(200).send('<Response></Response>');
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    res.status(500).send('Webhook processing failed');
  }
});

// --- API Routes for Lead CRUD ---
app.post('/api/leads', requireAuth, async (req, res) => {
  if (!fubService) {
    return res.status(503).json({ error: 'FUB service not configured' });
  }

  try {
    const leadData = req.body;
    const result = await fubService.createLead(leadData);
    res.json({ success: true, lead: result });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead in FUB', details: error.message });
  }
});

app.delete('/api/leads/:id', requireAuth, async (req, res) => {
  if (!fubService) {
    return res.status(503).json({ error: 'FUB service not configured' });
  }

  const { id } = req.params;
  
  try {
    await fubService.deleteLead(id);
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead from FUB', details: error.message });
  }
});

// --- API Route to Update Lead Status ---
app.put('/api/leads/:id/status', requireAuth, async (req, res) => {
  if (!fubService) {
    return res.status(503).json({ error: 'FUB service not configured' });
  }

  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    await fubService.updateLeadStatus(id, status);
    res.json({ success: true, message: 'Lead status updated successfully' });
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Failed to update lead status in FUB', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Eugenia Backend server is running on http://localhost:${PORT}`);
});