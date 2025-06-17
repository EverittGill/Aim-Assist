const express = require('express');
const router = express.Router();

let eugeniaMessageCount = 0;

module.exports = (geminiService, twilioService, fubService, conversationService, requireAuth) => {
  router.post('/generate-initial-message', requireAuth, async (req, res) => {
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

  router.post('/generate-reply', requireAuth, async (req, res) => {
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

  router.post('/send-ai-message', requireAuth, async (req, res) => {
    eugeniaMessageCount++;
    console.log(`\n📨 EUGENIA MESSAGE SEND REQUEST #${eugeniaMessageCount} ========================`);
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
      let eugeniaStatus = 'active';
      if (fubService) {
        try {
          const lead = await fubService.getLeadById(leadId);
          const statusField = process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus';
          eugeniaStatus = lead[statusField] || 'active';
          console.log(`Eugenia status for lead ${leadId}: ${eugeniaStatus}`);
        } catch (error) {
          console.error('Failed to check Eugenia status:', error.message);
        }
      }
      
      if (eugeniaStatus === 'inactive') {
        console.log(`🚫 Cannot send message - Eugenia is paused for lead ${leadId}`);
        return res.status(400).json({ 
          error: 'Cannot send message - Eugenia is paused for this lead',
          eugeniaPaused: true 
        });
      }
      
      const smsResult = await twilioService.sendSMS(leadPhoneNumber, message);
      
      if (fubService) {
        try {
          console.log(`📤 Logging outbound SMS to FUB for lead ${leadId}...`);
          console.log(`   From: ${process.env.TWILIO_FROM_NUMBER}`);
          console.log(`   To: ${leadPhoneNumber}`);
          console.log(`   Message: "${message.substring(0, 50)}..."`);
          
          const logResult = await fubService.logTextMessage(
            leadId, 
            message, 
            'outbound', 
            process.env.TWILIO_FROM_NUMBER,
            leadPhoneNumber
          );
          
          if (logResult.id === 'skipped') {
            console.log(`⚠️ Skipped FUB SMS logging for lead ${leadId}: ${logResult.reason}`);
          } else {
            console.log(`✅ Successfully logged outbound SMS to FUB for lead ${leadId} (FUB Message ID: ${logResult.id})`);
          }
        } catch (fubError) {
          console.error('❌ Failed to log SMS to FUB:', fubError.message);
          console.error('FUB Error Details:', fubError.response?.data || fubError);
        }
      } else {
        console.log('⚠️ FUB service not available - SMS not logged to FUB');
      }
      
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

  router.post('/log-incoming-message', requireAuth, async (req, res) => {
    const { leadId, leadName, message, currentConversation, leadPhoneNumber } = req.body;
    
    if (!leadId || !message || !currentConversation) {
      return res.status(400).json({ error: 'Lead ID, message, and conversation history are required' });
    }

    try {
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
        }
      }
      
      let eugeniaStatus = 'active';
      if (fubService) {
        try {
          const lead = await fubService.getLeadById(leadId);
          const statusField = process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus';
          eugeniaStatus = lead[statusField] || 'active';
          console.log(`Eugenia status for lead ${leadId}: ${eugeniaStatus}`);
        } catch (error) {
          console.error('Failed to check Eugenia status:', error.message);
        }
      }
      
      let aiMessage = null;
      let shouldAutoPause = false;
      if (geminiService && eugeniaStatus === 'active') {
        try {
          console.log(`🧠 Building complete context for lead ${leadId}...`);
          
          let contextToUse = currentConversation;
          let leadContext = null;
          
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
            contextToUse,
            agencyName,
            leadContext
          );
          
          aiMessage = result.message;
          shouldAutoPause = result.shouldAutoPause;
          
          console.log(`🤖 Generated AI response: "${aiMessage.substring(0, 50)}..."`);
          
          if (aiMessage && fubService) {
            try {
              console.log(`📤 Auto-logging AI response to FUB for lead ${leadId}...`);
              const logResult = await fubService.logTextMessage(
                leadId,
                aiMessage,
                'outbound',
                process.env.TWILIO_FROM_NUMBER,
                leadPhoneNumber
              );
              
              if (logResult.id === 'skipped') {
                console.log(`⚠️ Skipped auto-logging AI response: ${logResult.reason}`);
              } else {
                console.log(`✅ Successfully auto-logged AI response to FUB (Message ID: ${logResult.id})`);
              }
            } catch (fubError) {
              console.error('❌ Failed to auto-log AI response to FUB:', fubError.message);
            }
          }
          
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
      } else if (eugeniaStatus === 'inactive') {
        console.log(`🚫 Eugenia is paused for lead ${leadId}. No AI response generated.`);
      }
      
      res.json({ 
        success: true,
        aiMessage,
        shouldAutoPause,
        eugeniaPaused: eugeniaStatus === 'inactive',
        message: eugeniaStatus === 'inactive' 
          ? 'Message logged. Eugenia is paused for this lead.' 
          : 'Incoming message logged successfully'
      });
    } catch (error) {
      console.error('Error processing incoming message:', error);
      res.status(500).json({ error: 'Failed to process incoming message' });
    }
  });

  router.post('/initiate-ai-outreach', requireAuth, async (req, res) => {
    try {
      if (!fubService) {
        return res.status(503).json({ error: 'FUB service not configured' });
      }
      
      if (!geminiService) {
        return res.status(503).json({ error: 'AI service not configured' });
      }
      
      if (!twilioService) {
        return res.status(503).json({ error: 'SMS service not configured' });
      }
      
      // Create lead detection service
      const LeadDetectionService = require('../services/leadDetectionService');
      const leadDetectionService = new LeadDetectionService(fubService);
      
      // Scan for new leads
      const eligibleLeads = await leadDetectionService.scanForNewLeads();
      
      if (eligibleLeads.length === 0) {
        return res.json({ 
          success: true,
          message: 'No new leads found for AI outreach',
          stats: {
            scanned: 0,
            eligible: 0,
            processed: 0
          }
        });
      }
      
      // Process leads for outreach (max 5 at a time for safety)
      const processingResults = await leadDetectionService.processLeadsForOutreach(
        eligibleLeads, 
        { maxBatchSize: 5, delayMs: 1000 }
      );
      
      // Generate initial messages and send
      const outreachResults = [];
      const agencyName = process.env.USER_AGENCY_NAME || 'Our Agency';
      const appDomain = process.env.APP_DOMAIN || 'https://eugenia-app.com';
      
      for (const result of processingResults.successful) {
        const lead = result.lead;
        
        try {
          console.log(`\n🤖 Generating initial message for ${lead.name}...`);
          
          // Generate initial outreach message
          const aiMessage = await geminiService.generateInitialOutreach(lead, agencyName);
          console.log(`Generated message: "${aiMessage}"`);
          
          // Send SMS
          console.log(`📱 Sending SMS to ${lead.phone}...`);
          const smsResult = await twilioService.sendSMS(lead.phone, aiMessage);
          console.log(`SMS sent successfully: ${smsResult.messageSid}`);
          
          // Log to FUB
          await fubService.logTextMessage(
            lead.id,
            aiMessage,
            'outbound',
            process.env.TWILIO_FROM_NUMBER,
            lead.phone
          );
          console.log('Message logged to FUB');
          
          // Update lead status and conversation link
          const conversationUrl = `${appDomain}/conversation/${lead.id}`;
          
          // Update Eugenia talking status to active
          await fubService.updateLeadCustomField(
            lead.id,
            process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME,
            'active'
          );
          
          // Update conversation link
          await fubService.updateLeadCustomField(
            lead.id,
            process.env.FUB_EUGENIA_CONVERSATION_LINK_FIELD_NAME,
            conversationUrl
          );
          
          console.log(`✅ Successfully initiated AI outreach for ${lead.name}`);
          
          outreachResults.push({
            leadId: lead.id,
            leadName: lead.name,
            status: 'success',
            message: aiMessage,
            conversationUrl
          });
          
        } catch (error) {
          console.error(`❌ Failed to initiate outreach for ${lead.name}:`, error);
          outreachResults.push({
            leadId: lead.id,
            leadName: lead.name,
            status: 'failed',
            error: error.message
          });
        }
        
        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Prepare response
      const successCount = outreachResults.filter(r => r.status === 'success').length;
      const failedCount = outreachResults.filter(r => r.status === 'failed').length;
      
      res.json({ 
        success: true,
        message: `Processed ${eligibleLeads.length} eligible leads`,
        stats: {
          scanned: eligibleLeads.length,
          eligible: processingResults.successful.length,
          processed: successCount,
          failed: failedCount,
          skipped: processingResults.skipped.length
        },
        results: outreachResults
      });
      
    } catch (error) {
      console.error('Error processing new leads:', error);
      res.status(500).json({ 
        error: 'Failed to process new leads',
        details: error.message 
      });
    }
  });

  return router;
};