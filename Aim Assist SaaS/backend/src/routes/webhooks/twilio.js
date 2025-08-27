/**
 * Twilio Webhook Handler
 * Receives incoming SMS messages and triggers extraction
 * Handles message status callbacks
 */

const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const ConversationService = require('../../services/ConversationService');
const ConversationSyncService = require('../../services/ConversationSyncService');
const ContextEnrichmentService = require('../../services/ContextEnrichmentService');
const CRMFactory = require('../../services/crm/CRMFactory');
const AIService = require('../../services/ai/AIService');
const PhoneMatchingService = require('../../services/PhoneMatchingService');
const TenantPhoneService = require('../../services/TenantPhoneService');
const QueueManager = require('../../queues/QueueManager');
const queueManager = require('../../queues/QueueManager').default;

// Twilio webhook signature validation middleware
const validateTwilioSignature = (req, res, next) => {
  // Log all incoming webhook attempts
  console.log('🔔 Twilio webhook received:', {
    headers: req.headers,
    body: req.body,
    url: req.originalUrl,
    method: req.method
  });
  
  // Skip validation in development
  if (process.env.NODE_ENV === 'development') {
    console.log('⚡ Skipping signature validation (development mode)');
    return next();
  }
  
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.DEMO_TWILIO_AUTH_TOKEN;
  
  if (!authToken) {
    console.error('⚠️ TWILIO_AUTH_TOKEN not configured');
    return res.status(500).send('Server configuration error');
  }
  
  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    params
  );
  
  if (!isValid) {
    console.error('❌ Invalid Twilio signature');
    return res.status(403).send('Forbidden');
  }
  
  next();
};

/**
 * Handle incoming SMS
 */
router.post('/sms', validateTwilioSignature, async (req, res) => {
  try {
    const {
      From: fromPhone,
      To: toPhone,
      Body: messageContent,
      MessageSid: twilioSid,
      NumMedia: numMedia = '0',
      AccountSid: accountSid
    } = req.body;
    
    console.log(`📱 Incoming SMS from ${fromPhone}: ${messageContent}`);
    
    // Send immediate response to Twilio
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
    // Process message asynchronously
    processIncomingSMS({
      fromPhone,
      toPhone,
      messageContent,
      twilioSid,
      numMedia: parseInt(numMedia),
      accountSid
    }).catch(error => {
      console.error('Error processing incoming SMS:', error.message);
      console.error('Stack:', error.stack);
    });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Process incoming SMS asynchronously
 */
async function processIncomingSMS(data) {
  const { fromPhone, toPhone, messageContent, twilioSid } = data;
  
  console.log('📤 Processing SMS:', { fromPhone, toPhone, messagePreview: messageContent.substring(0, 50) });
  
  try {
    // Determine tenant from phone number
    const tenantId = await getTenantFromPhone(toPhone);
    
    if (!tenantId) {
      console.error(`No tenant found for phone ${toPhone}`);
      return;
    }
    
    console.log(`🏢 Using tenant: ${tenantId}`);
    
    // Use PhoneMatchingService to find or create lead
    const phoneService = new PhoneMatchingService(tenantId);
    const result = await phoneService.findOrCreateLeadByPhone(fromPhone);
    
    if (!result || !result.lead) {
      console.error('❌ Failed to find or create lead for phone:', fromPhone);
      return;
    }
    
    const { lead, source, needsSync } = result;
    const leadId = lead.crm_lead_id || lead.id;
    
    console.log(`✅ Lead ${leadId} (${lead.full_name || 'No name'}) - Source: ${source}`);
    
    // If we need to sync, get latest from CRM first
    if (needsSync) {
      console.log('🔄 Syncing lead data from CRM...');
      const adapter = await CRMFactory.getAdapter(tenantId);
      const crmLead = await adapter.getLead(leadId);
      if (crmLead) {
        await phoneService.syncLeadToSupabase(crmLead);
      }
    }
    
    // Process the message
    await processLeadMessage(tenantId, leadId, messageContent, twilioSid, { fromPhone, toPhone });
    
  } catch (error) {
    console.error('Error processing SMS:', error);
  }
}

/**
 * Process message from known lead
 */
async function processLeadMessage(tenantId, leadId, messageContent, twilioSid, phoneData = {}) {
  try {
    console.log(`💬 Processing message for lead ${leadId} in tenant ${tenantId}`);
    
    // First, ensure the lead exists in our database
    const { supabase } = require('../../config/supabase');
    
    if (supabase) {
      // Check if lead exists in database
      const { data: existingLead, error: checkError } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', tenantId)
        .eq('crm_lead_id', leadId)
        .single();
      
      if (!existingLead) {
        console.log(`📝 Creating lead ${leadId} in database...`);
        
        // Get lead details from CRM
        const adapter = await CRMFactory.getAdapter(tenantId);
        const crmLead = await adapter.getLead(leadId);
        
        // Create lead in database
        const { data: newLead, error: createError } = await supabase
          .from('leads')
          .insert({
            organization_id: tenantId,
            crm_lead_id: leadId,
            crm_type: 'followupboss',
            first_name: crmLead.first_name || 'Unknown',
            last_name: crmLead.last_name || '',
            email: crmLead.email || null,
            phone: crmLead.phone || null,
            status: 'active',
            source: crmLead.source || 'sms',
            tags: crmLead.tags || [],
            metadata: {
              original_data: crmLead
            }
          })
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Error creating lead in database:', createError);
        } else {
          console.log('✅ Lead created in database:', newLead.id);
        }
      }
    }
    
    const conversationService = new ConversationService(tenantId);
    
    // Get or create conversation FIRST (needed for message storage)
    const conversation = await conversationService.getOrCreateConversation(leadId);
    
    if (!conversation || !conversation.id) {
      console.error('❌ Failed to get/create conversation for lead:', leadId);
      throw new Error(`Cannot process message without valid conversation for lead ${leadId}`);
    }
    
    // Sync CRM messages and get enrichment
    let enrichedContext = {};
    try {
      console.log(`🔄 Syncing and enriching context for lead ${leadId}...`);
      const syncService = new ConversationSyncService(tenantId);
      await syncService.syncConversationBeforeAI(leadId);
      
      const contextService = new ContextEnrichmentService(tenantId);
      enrichedContext = await contextService.getEnrichedContext(leadId);
      console.log(`✅ Context enrichment successful`);
    } catch (enrichError) {
      console.error('⚠️ Enrichment failed, continuing with basic context:', enrichError.message);
      // Continue with empty enrichedContext - don't fail the whole webhook
    }
    
    // Get previous extraction results from database (if available)
    let previousExtraction = null;
    if (supabase) {
      // Need to get the Supabase lead ID first for extraction lookup
      const { data: dbLead } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', tenantId)
        .eq('crm_lead_id', leadId)
        .single();
      
      if (dbLead) {
        const { data: lastExtraction } = await supabase
          .from('extraction_logs')
          .select('*')
          .eq('organization_id', tenantId)
          .eq('lead_id', dbLead.id)  // Use Supabase UUID
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        previousExtraction = lastExtraction?.extraction_data || null;
        if (previousExtraction) {
          console.log(`📊 Using previous extraction with ${Math.round((previousExtraction.overallConfidence || 0) * 100)}% confidence`);
        }
      }
    }
    
    // Add extraction data to enrichedContext
    enrichedContext.extraction = previousExtraction;
    
    // Add incoming message to conversation
    await conversationService.addMessage(conversation.id, {
      lead_id: conversation.lead_id,  // Add required lead_id
      direction: 'inbound',
      message_type: 'text',  // Add required field
      sender_type: 'lead',
      content: messageContent,
      provider_sid: twilioSid,  // Use provider_sid to match table schema
      channel_type: 'sms',
      from_phone: phoneData.fromPhone,
      to_phone: phoneData.toPhone
    });
    
    // Log message to FUB for native conversation tracking
    try {
      const adapter = await CRMFactory.getAdapter(tenantId);
      const fromPhone = phoneData.fromPhone || '+17068184445'; // Use actual from phone
      const toPhone = phoneData.toPhone || '+18662981158';
      
      const logged = await adapter.logMessage(leadId, {
        direction: 'inbound',
        content: messageContent,
        from: fromPhone,
        to: toPhone
      });
      
      if (logged) {
        console.log('✅ Message logged to FUB conversation');
      } else {
        console.log('⚠️ Failed to log message to FUB');
      }
    } catch (fubError) {
      console.error('Error logging to FUB:', fubError.message);
    }
    
    // Queue extraction job with enriched context
    await queueManager.queueExtraction({
      tenantId,
      leadId,
      conversationId: conversation.id,
      currentMessage: messageContent,
      trigger: 'incoming_sms',
      options: {
        confidenceThreshold: 0.7,
        autoUpdateThreshold: 0.85,
        enrichedContext: enrichedContext  // Pass the enriched context we fetched
      }
    });
    
    console.log(`✅ Extraction queued for lead ${leadId}`);
    
    // Check if AI should respond
    const shouldRespond = conversation.ai_enabled !== false && conversation.status === 'active';
    console.log(`🤖 AI should respond: ${shouldRespond} (ai_enabled: ${conversation.ai_enabled}, status: ${conversation.status})`);
    
    if (shouldRespond) {
      console.log(`🚀 Generating AI response for lead ${leadId} in tenant ${tenantId}`);
      await generateAndQueueAIResponse(tenantId, leadId, conversation.id, messageContent, enrichedContext);
    } else {
      console.log(`⏸️ AI not responding (ai_enabled: ${conversation.ai_enabled}, status: ${conversation.status})`);
    }
    
  } catch (error) {
    console.error(`Error processing lead message for ${leadId}:`, error);
  }
}

/**
 * Generate and queue AI response with Claude
 */
async function generateAndQueueAIResponse(tenantId, leadId, conversationId, currentMessage, enrichedContext) {
  console.log(`\n🔄 generateAndQueueAIResponse called:`, {
    tenantId,
    leadId,
    conversationId,
    messagePreview: currentMessage.substring(0, 50)
  });
  
  try {
    const conversationService = new ConversationService(tenantId);
    const ClaudeService = require('../../services/ai/ClaudeService');
    const claudeService = new ClaudeService(tenantId);
    console.log(`✅ Claude service initialized for tenant ${tenantId}`);
    
    // Get full conversation from Supabase (already synced in processLeadMessage)
    console.log(`📖 Getting conversation history for lead ${leadId}...`);
    const messages = await conversationService.getHistory(leadId, 100);
    console.log(`📖 Got ${messages.length} messages from Supabase (source of truth)`);
    
    // Get lead details from SUPABASE
    console.log(`🔍 Fetching lead details from Supabase for lead ${leadId}...`);
    const { supabase } = require('../../config/supabase');
    
    // Try to fetch by CRM lead ID first (leadId is usually the CRM ID like "622")
    let { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', tenantId)
      .eq('crm_lead_id', leadId)
      .single();
    
    // If not found and leadId looks like a UUID, try by database ID
    if (!lead && leadId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const result = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', tenantId)
        .eq('id', leadId)
        .single();
      lead = result.data;
      leadError = result.error;
    }
    
    console.log(`🔍 Lead fetch result:`, { found: !!lead, error: leadError?.message });
    
    if (leadError || !lead) {
      console.error('Lead not found in Supabase:', leadError);
      // Fallback to CRM if needed
      const adapter = await CRMFactory.getAdapter(tenantId);
      const crmLead = await adapter.getLead(leadId);
      return crmLead;
    }
    
    // Build context for AI
    const context = {
      lead: {
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        source: lead.source,
        tags: lead.tags || []
      },
      conversation: messages.map(msg => ({
        role: msg.sender_type === 'lead' ? 'user' : 'assistant',
        content: msg.content
      })),
      template: 'conversation_reply'
    };
    
    // Generate AI response using Claude with full enriched context
    console.log(`📝 Calling Claude with enriched context for lead ${leadId}...`);
    const response = await claudeService.generateResponse({
      leadId,
      leadName: lead.first_name || context.lead.name,
      currentMessage,
      conversationHistory: messages,  // Full history from Supabase
      leadContext: {
        // Supabase lead data
        source: lead.source || context.lead.source,
        tags: lead.tags || context.lead.tags || [],
        timeline: lead.custom_fields?.timeline,
        budget: lead.custom_fields?.budget,
        location: lead.custom_fields?.location,
        propertyType: lead.custom_fields?.property_type,
        // Enriched CRM data
        ...enrichedContext.profile,
        ...enrichedContext.financial,
        ...enrichedContext.timeline,
        propertyInterests: enrichedContext.propertyInterests,
        behaviorMetrics: enrichedContext.behavior,
        // Previous extraction results
        extractedData: enrichedContext.extraction ? {
          timeline: enrichedContext.extraction.timeline,
          budget: enrichedContext.extraction.budget,
          agentStatus: enrichedContext.extraction.agentStatus,
          financing: enrichedContext.extraction.financing,
          motivation: enrichedContext.extraction.motivation,
          qualificationScore: enrichedContext.extraction.overallConfidence
        } : null
      },
      agencyName: process.env.USER_AGENCY_NAME || 'our team'
    });
    
    console.log(`🤖 Claude response received:`, {
      hasResponse: !!response,
      responseType: typeof response,
      responseLength: response ? (typeof response === 'string' ? response.length : JSON.stringify(response).length) : 0
    });
    
    if (response) {
      // Get lead phone number
      const leadPhone = lead.phone || lead.phones?.[0]?.value;
      
      if (!leadPhone) {
        console.error(`❌ No phone number found for lead ${leadId}`);
        return;
      }
      
      // Extract the message text (response might be object or string)
      const messageText = typeof response === 'object' ? response.message : response;
      const isQualified = typeof response === 'object' ? response.isQualified : false;
      const shouldPause = typeof response === 'object' ? response.shouldPause : false;
      
      // Queue SMS for sending
      await queueManager.queueSMS({
        tenantId,
        leadId,
        to: leadPhone,
        message: messageText,
        conversationId,
        delay: 45000 // 45 second delay for natural feel
      });
      
      console.log(`🤖 Claude AI response queued for lead ${leadId}: "${messageText.substring(0, 50)}..."`);
      
      // Handle qualified lead
      if (isQualified && shouldPause) {
        console.log('🎯 Lead is qualified! Pausing AI and notifying agent...');
        
        // Update lead status in FUB to pause AI
        try {
          await adapter.updateLead(leadId, {
            customEugeniaTalkingStatus: 'paused_qualified',
            customQualificationStatus: 'qualified',
            customQualificationReason: response.qualification?.escalationReason
          });
        } catch (error) {
          console.error('Error updating lead status:', error.message);
        }
        
        // Send notification to agent
        // Get tenant's notification phone from configuration
        const TenantService = require('../../services/TenantService');
        const tenantConfig = await TenantService.getTenantConfig(tenantId);
        const notificationPhone = tenantConfig.settings?.notification_phone || process.env.USER_NOTIFICATION_PHONE;
        
        if (notificationPhone) {
          // Build FUB lead URL
          const fubLeadUrl = `https://app.followupboss.com/2/people/view/${leadId}`;
          
          await queueManager.queueSMS({
            tenantId,
            leadId: null, // System message
            to: notificationPhone,
            message: `🎯 QUALIFIED LEAD: ${lead.first_name || 'Lead'} ${lead.last_name || ''} (${leadPhone})\nReason: ${response.qualification?.escalationReason || 'Qualified'}\nScore: ${response.qualification?.qualificationScore || 0}%\n\nView in FUB: ${fubLeadUrl}`,
            conversationId: null,
            delay: 0 // Send immediately
          });
          console.log(`📱 Agent notification queued to ${notificationPhone} with FUB link`);
        }
      }
      
      // Log AI response to conversation
      // Extract just the message text if response is an object
      const messageContent = typeof response === 'object' && response.message 
        ? response.message 
        : response;
      
      await conversationService.addMessage(conversationId, {
        lead_id: lead.id,  // Use Supabase UUID from lead object
        direction: 'outbound',
        message_type: 'text',
        sender_type: 'ai',
        content: messageContent,  // Store only the message text
        channel_type: 'sms',
        metadata: {
          ai_provider: 'claude',
          generated_at: new Date().toISOString(),
          // Store qualification data separately in metadata if needed
          ...(typeof response === 'object' && response.isQualified ? {
            qualification: response.qualification,
            isQualified: response.isQualified
          } : {})
        }
      });
    }
    
  } catch (error) {
    console.error(`Error generating AI response for lead ${leadId}:`, error);
  }
}

/**
 * Handle message status callbacks
 */
router.post('/status', validateTwilioSignature, async (req, res) => {
  try {
    const {
      MessageSid: twilioSid,
      MessageStatus: status,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage
    } = req.body;
    
    console.log(`📬 Message status update: ${twilioSid} - ${status}`);
    
    if (errorCode) {
      console.error(`❌ Message error ${errorCode}: ${errorMessage}`);
      
      // TODO: Update message status in database
      // TODO: Trigger retry if appropriate
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('Status webhook error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Get tenant ID from phone number
 * CRITICAL: This determines which tenant receives the message
 */
async function getTenantFromPhone(phoneNumber) {
  // Use TenantPhoneService for proper multi-tenant routing
  const tenantId = await TenantPhoneService.getTenantFromPhone(phoneNumber);
  
  if (!tenantId) {
    console.error(`❌ No tenant found for phone ${phoneNumber}`);
    console.error('This phone number must be registered to a tenant in the phone_numbers table');
    // In multi-tenant system, we MUST reject messages to unregistered numbers
    return null;
  }
  
  console.log(`✅ Found tenant ${tenantId} for phone ${phoneNumber}`);
  return tenantId;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone) {
  if (!phone) return null;
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Add country code if missing
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  } else if (digits.startsWith('+')) {
    return phone;
  }
  
  return `+${digits}`;
}

/**
 * Test endpoint for webhook
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    webhook: 'twilio',
    configured: {
      authToken: !!(process.env.TWILIO_AUTH_TOKEN || process.env.DEMO_TWILIO_AUTH_TOKEN),
      accountSid: !!(process.env.TWILIO_ACCOUNT_SID || process.env.DEMO_TWILIO_ACCOUNT_SID),
      fromNumber: !!(process.env.TWILIO_FROM_NUMBER || process.env.DEMO_TWILIO_FROM_NUMBER)
    }
  });
});

module.exports = router;