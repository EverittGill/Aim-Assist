const express = require('express');
const router = express.Router();
const ConversationService = require('../services/ConversationService');
const AIService = require('../services/ai/AIService');
const CRMFactory = require('../services/crm/CRMFactory');
const TwilioService = require('../services/messaging/TwilioService');

/**
 * Multi-tenant conversation and messaging routes
 */

module.exports = (authService) => {
  const requireAuth = authService?.createAuthMiddleware() || ((req, res, next) => next());

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
      
      // Get lead details
      const adapter = await CRMFactory.getAdapter(tenantId);
      const lead = await adapter.getLead(lead_id);
      
      if (!lead || !lead.phone) {
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
      
      // Log to FUB first for visibility (even if Supabase fails)
      try {
        await adapter.logMessage(lead_id, {
          direction: 'outbound',
          content: content,
          from: result.from || process.env.DEMO_TWILIO_FROM_NUMBER,
          to: lead.phone
        });
        console.log('✅ Message logged to FUB');
      } catch (fubError) {
        console.error('Failed to log to FUB:', fubError.message);
      }
      
      // Store message in conversation history (Supabase)
      try {
        const conversationService = new ConversationService(tenantId);
        const conversation = await conversationService.getOrCreateConversation(lead_id);
        await conversationService.addMessage(conversation.id, {
          lead_id: conversation.lead_id,
          direction: 'outbound',
          message_type: 'text',
          sender_type: 'ai',
          channel_type: type,
          content: content,
          status: 'sent',  // Use 'sent' instead of Twilio's status
          provider_sid: result.sid,  // Changed from twilio_sid
          from_phone: result.from,
          to_phone: result.to
        });
        console.log('✅ Message saved to Supabase');
      } catch (dbError) {
        console.error('Failed to save to Supabase:', dbError.message);
        // Don't throw - SMS was sent and logged to FUB
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
      
      // Get lead details
      const adapter = await CRMFactory.getAdapter(tenantId);
      const lead = await adapter.getLead(lead_id);
      
      // Build context for AI
      const context = {
        lead: {
          name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          source: lead.source,
          tags: lead.tags || []
        },
        conversation: conversation || [],
        template: template,
        agency_name: process.env.DEFAULT_AGENCY_NAME || 'Your Agency'
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
