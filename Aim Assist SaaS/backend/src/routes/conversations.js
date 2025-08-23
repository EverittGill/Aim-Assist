const express = require('express');
const router = express.Router();
const ConversationService = require('../services/ConversationService');
const AIService = require('../services/ai/AIService');
const CRMFactory = require('../services/crm/CRMFactory');
const TwilioService = require('../services/messaging/TwilioService');
const { supabase } = require('../config/supabase');

/**
 * Multi-tenant conversation and messaging routes
 */

// Supabase auth middleware
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // Verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Auth error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get tenant for this user
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    req.user = user;
    req.tenantId = tenant.id;
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = (authService) => {

  // Get conversation history for a lead
  router.get('/:leadId', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.leadId;
      
      console.log(`Fetching conversation for lead ${leadId}, tenant ${tenantId}`);
      
      // Get conversation history
      const conversationService = new ConversationService(tenantId);
      const messages = await conversationService.getHistory(leadId);
      
      res.json(messages);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ 
        error: 'Failed to fetch conversation', 
        details: error.message 
      });
    }
  });

  // Send a message
  router.post('/send', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const { lead_id, content, type = 'sms' } = req.body;
      
      if (!lead_id || !content) {
        return res.status(400).json({ 
          error: 'lead_id and content are required' 
        });
      }
      
      // Get lead details FROM SUPABASE
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`crm_lead_id.eq.${lead_id},id.eq.${lead_id}`)
        .single();
      
      if (leadError || !lead || !lead.phone) {
        return res.status(400).json({ 
          error: 'Lead not found or missing phone number' 
        });
      }
      
      // Send SMS via Twilio
      const twilioService = new TwilioService(tenantId);
      const result = await twilioService.sendSMS(
        lead.phone, 
        content
        // from number will be auto-determined by TwilioService
      );
      
      // Store message in Supabase FIRST (source of truth)
      try {
        const conversationService = new ConversationService(tenantId);
        const conversation = await conversationService.getOrCreateConversation(lead.crm_lead_id || lead.id);
        await conversationService.addMessage(conversation.id, {
          lead_id: conversation.lead_id,
          direction: 'outbound',
          message_type: 'text',
          sender_type: 'ai',
          channel_type: type,
          content: content,
          status: 'sent',
          provider_sid: result.sid,
          from_phone: result.from,
          to_phone: result.to
        });
        console.log('✅ Message saved to Supabase');
      } catch (dbError) {
        console.error('Failed to save to Supabase:', dbError.message);
        // Still continue - SMS was sent
      }
      
      // Then sync to CRM for visibility (background task)
      try {
        const adapter = await CRMFactory.getAdapter(tenantId);
        await adapter.logMessage(lead.crm_lead_id, {
          direction: 'outbound',
          content: content,
          from: result.from || process.env.DEMO_TWILIO_FROM_NUMBER,
          to: lead.phone
        });
        console.log('✅ Message synced to FUB');
      } catch (crmError) {
        console.error('⚠️ Failed to sync to CRM (will retry):', crmError.message);
        // Could queue for retry here
      }
      
      res.json({ 
        success: true,
        message: {
          id: result.sid,
          content: content,
          direction: 'outbound',
          created_at: new Date().toISOString(),
          status: result.status
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ 
        error: 'Failed to send message', 
        details: error.message 
      });
    }
  });

  // Generate AI message
  router.post('/generate', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const { lead_id, conversation, template = 'conversation_reply' } = req.body;
      
      if (!lead_id) {
        return res.status(400).json({ 
          error: 'lead_id is required' 
        });
      }
      
      // Get lead details FROM SUPABASE
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`crm_lead_id.eq.${lead_id},id.eq.${lead_id}`)
        .single();
      
      if (leadError || !lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      // Build context for AI
      const context = {
        lead: {
          name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          source: lead.source,
          tags: lead.tags || []
        },
        conversation: conversation || [],
        template: template,
        agency_name: req.tenant?.settings?.agency_name || process.env.DEFAULT_AGENCY_NAME || 'Your Agency'
      };
      
      // Generate AI response
      const aiService = new AIService(tenantId);
      const response = await aiService.generateReply(context);
      
      res.json({ 
        success: true,
        content: response.content,
        provider: response.provider
      });
    } catch (error) {
      console.error('Error generating AI message:', error);
      res.status(500).json({ 
        error: 'Failed to generate AI message', 
        details: error.message 
      });
    }
  });

  return router;
};
