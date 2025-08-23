/**
 * Property Viewing Webhook Handler
 * Receives property viewing events from CRM or website tracking
 */

const express = require('express');
const router = express.Router();
const NurturingService = require('../../services/NurturingService');
const PhoneMatchingService = require('../../services/PhoneMatchingService');

/**
 * Handle property viewing event
 * Expected payload:
 * {
 *   leadId: "123",           // CRM lead ID
 *   leadPhone: "+1234567890", // Alternative to leadId
 *   propertyId: "MLS123",
 *   propertyAddress: "123 Main St",
 *   viewCount: 1,
 *   totalProperties: 5,      // Total viewed in session
 *   sessionDuration: 600,    // Seconds
 *   source: "website",
 *   timestamp: "2025-01-22T10:30:00Z"
 * }
 */
router.post('/viewing', async (req, res) => {
  try {
    console.log('🏠 Property viewing webhook received:', req.body);
    
    const {
      tenantId,
      leadId,
      leadPhone,
      propertyId,
      propertyAddress,
      viewCount = 1,
      totalProperties = 1,
      sessionDuration = 0,
      source = 'website',
      timestamp = new Date()
    } = req.body;
    
    // Validate required fields
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId required' });
    }
    
    if (!leadId && !leadPhone) {
      return res.status(400).json({ error: 'leadId or leadPhone required' });
    }
    
    if (!propertyId || !propertyAddress) {
      return res.status(400).json({ error: 'propertyId and propertyAddress required' });
    }
    
    // Send immediate response
    res.status(200).json({ status: 'processing' });
    
    // Process asynchronously
    processPropertyViewing({
      tenantId,
      leadId,
      leadPhone,
      propertyId,
      propertyAddress,
      viewCount,
      totalProperties,
      sessionDuration,
      source,
      timestamp
    }).catch(error => {
      console.error('Error processing property viewing:', error);
    });
    
  } catch (error) {
    console.error('Property webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Process property viewing asynchronously
 */
async function processPropertyViewing(data) {
  const { tenantId, leadId, leadPhone, ...viewingData } = data;
  
  try {
    let finalLeadId = leadId;
    
    // If no leadId, find by phone
    if (!finalLeadId && leadPhone) {
      const phoneService = new PhoneMatchingService(tenantId);
      const result = await phoneService.findOrCreateLeadByPhone(leadPhone);
      
      if (result && result.lead) {
        finalLeadId = result.lead.crm_lead_id || result.lead.id;
        console.log(`✅ Found lead ${finalLeadId} by phone ${leadPhone}`);
      }
    }
    
    if (!finalLeadId) {
      console.error('Could not identify lead for property viewing');
      return;
    }
    
    // Process with nurturing service
    const nurturingService = new NurturingService(tenantId);
    await nurturingService.handlePropertyViewing(finalLeadId, viewingData);
    
  } catch (error) {
    console.error('Error in processPropertyViewing:', error);
  }
}

/**
 * Batch property viewing events
 */
router.post('/viewing/batch', async (req, res) => {
  try {
    const { tenantId, events } = req.body;
    
    if (!tenantId || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    console.log(`📦 Processing ${events.length} property viewing events`);
    
    res.status(200).json({ 
      status: 'processing',
      count: events.length 
    });
    
    // Process each event
    for (const event of events) {
      await processPropertyViewing({
        ...event,
        tenantId
      }).catch(error => {
        console.error('Error processing batch event:', error);
      });
    }
    
  } catch (error) {
    console.error('Batch webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Test endpoint
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    webhook: 'property',
    endpoints: [
      '/viewing - Single property viewing event',
      '/viewing/batch - Multiple viewing events'
    ]
  });
});

module.exports = router;