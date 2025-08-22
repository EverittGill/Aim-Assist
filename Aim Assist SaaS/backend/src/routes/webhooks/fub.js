/**
 * Follow Up Boss Webhook Handler
 * Processes real-time lead updates from FUB
 */

const express = require('express');
const router = express.Router();
const CRMSyncService = require('../../services/CRMSyncService');
const QueueManager = require('../../queues/QueueManager').default;

/**
 * Handle FUB webhook events
 * POST /webhook/fub
 */
router.post('/', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`📨 FUB webhook received: ${event}`);
    
    // Immediately respond to FUB
    res.status(200).send('OK');
    
    // Process webhook asynchronously
    processWebhook(event, data).catch(error => {
      console.error('Error processing FUB webhook:', error);
    });
    
  } catch (error) {
    console.error('FUB webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

/**
 * Process webhook event asynchronously
 */
async function processWebhook(event, data) {
  // Determine tenant from webhook data or headers
  // For now, use demo tenant
  const tenantId = '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
  
  switch (event) {
    case 'person.created':
      console.log(`👤 New lead created in FUB: ${data.name} (ID: ${data.id})`);
      await handleLeadCreated(tenantId, data);
      break;
      
    case 'person.updated':
      console.log(`📝 Lead updated in FUB: ${data.name} (ID: ${data.id})`);
      await handleLeadUpdated(tenantId, data);
      break;
      
    case 'person.deleted':
      console.log(`🗑️ Lead deleted in FUB: ${data.id}`);
      await handleLeadDeleted(tenantId, data);
      break;
      
    case 'textMessage.created':
      console.log(`💬 New text message in FUB from lead ${data.personId}`);
      await handleTextMessage(tenantId, data);
      break;
      
    case 'note.created':
      console.log(`📝 New note added to lead ${data.personId}`);
      // Could trigger extraction if note contains valuable info
      break;
      
    case 'tag.added':
      console.log(`🏷️ Tag added to lead ${data.personId}: ${data.tag}`);
      await handleTagAdded(tenantId, data);
      break;
      
    default:
      console.log(`⚠️ Unknown FUB webhook event: ${event}`);
  }
}

/**
 * Handle new lead created in FUB
 */
async function handleLeadCreated(tenantId, leadData) {
  try {
    // Queue sync for this specific lead
    await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'single',
      leadId: leadData.id
    });
    
    // Check if lead should be added to auto-text
    if (shouldAutoText(leadData)) {
      await QueueManager.queueAutoText({
        tenantId,
        leadId: leadData.id,
        trigger: 'new_lead'
      }, 1); // 1 minute delay
    }
  } catch (error) {
    console.error('Error handling lead created:', error);
  }
}

/**
 * Handle lead updated in FUB
 */
async function handleLeadUpdated(tenantId, leadData) {
  try {
    // Queue sync for this specific lead
    await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'single',
      leadId: leadData.id
    });
    
    // Check if important fields changed that might affect extraction
    if (leadData.tags || leadData.customFields) {
      console.log('📊 Lead tags/custom fields updated - may need re-extraction');
    }
  } catch (error) {
    console.error('Error handling lead updated:', error);
  }
}

/**
 * Handle lead deleted in FUB
 */
async function handleLeadDeleted(tenantId, leadData) {
  try {
    // Mark lead as deleted in our database
    const { supabase } = require('../../config/supabase');
    
    if (supabase) {
      await supabase
        .from('leads')
        .update({
          status: 'deleted',
          sync_status: 'deleted',
          updated_at: new Date()
        })
        .eq('tenant_id', tenantId)
        .eq('crm_lead_id', leadData.id.toString());
    }
  } catch (error) {
    console.error('Error handling lead deleted:', error);
  }
}

/**
 * Handle new text message from FUB
 */
async function handleTextMessage(tenantId, messageData) {
  try {
    // Could trigger extraction if message contains important info
    if (messageData.message && messageData.personId) {
      await QueueManager.queueExtraction({
        tenantId,
        leadId: messageData.personId,
        currentMessage: messageData.message,
        trigger: 'fub_webhook',
        options: {
          confidenceThreshold: 0.7,
          autoUpdateThreshold: 0.85
        }
      });
    }
  } catch (error) {
    console.error('Error handling text message:', error);
  }
}

/**
 * Handle tag added to lead
 */
async function handleTagAdded(tenantId, tagData) {
  try {
    // Sync lead to update tags
    await QueueManager.addJob('lead-sync', {
      tenantId,
      syncType: 'single',
      leadId: tagData.personId
    });
    
    // Check if this tag triggers auto-text
    const autoTextTags = ['Direct Connect', 'PPC', 'New Lead', 'Hot Lead'];
    if (autoTextTags.includes(tagData.tag)) {
      console.log(`🚀 Auto-text triggered by tag: ${tagData.tag}`);
      await QueueManager.queueAutoText({
        tenantId,
        leadId: tagData.personId,
        trigger: 'tag_added',
        tag: tagData.tag
      }, 1);
    }
  } catch (error) {
    console.error('Error handling tag added:', error);
  }
}

/**
 * Determine if lead should receive auto-text
 */
function shouldAutoText(leadData) {
  // Check for auto-text triggers
  const autoTextSources = ['Website', 'Landing Page', 'PPC', 'Facebook'];
  const autoTextTags = ['Direct Connect', 'PPC', 'New Lead'];
  
  if (autoTextSources.includes(leadData.source)) {
    return true;
  }
  
  if (leadData.tags && leadData.tags.some(tag => {
    const tagName = typeof tag === 'string' ? tag : tag.name;
    return autoTextTags.includes(tagName);
  })) {
    return true;
  }
  
  return false;
}

/**
 * Verify webhook signature (if FUB provides one)
 */
router.post('/verify', (req, res) => {
  // FUB webhook verification endpoint if needed
  res.status(200).send('Webhook verified');
});

module.exports = router;
