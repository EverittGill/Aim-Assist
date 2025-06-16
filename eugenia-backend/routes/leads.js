const express = require('express');
const router = express.Router();

module.exports = (fubService, conversationService, requireAuth) => {
  router.get('/', requireAuth, async (req, res) => {
    console.log('GET /api/leads endpoint: Attempting to fetch real leads from FUB');

    if (!fubService) {
      console.error('FUB service not configured');
      return res.status(503).json({ error: 'FUB service not configured' });
    }

    try {
      const leads = await fubService.fetchLeads();
      console.log(`Successfully fetched ${leads.length} leads from FUB.`);
      
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({ leads });
    } catch (error) {
      console.error('Error fetching leads:', error.message);
      res.status(500).json({ error: 'Failed to fetch leads from FUB', details: error.message });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
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

  router.delete('/:id', requireAuth, async (req, res) => {
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

  router.put('/:id/status', requireAuth, async (req, res) => {
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
      
      const eugeniaStatusField = process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME || 'customEugeniaTalkingStatus';
      const isPaused = status.toLowerCase().includes('paused');
      const fieldValue = isPaused ? 'inactive' : 'active';
      
      console.log(`Updating Eugenia talking Status for lead ${id} to: ${fieldValue}`);
      await fubService.updateLeadCustomField(id, eugeniaStatusField, fieldValue);
      
      res.json({ 
        success: true, 
        message: 'Lead status updated successfully',
        eugeniaStatus: fieldValue 
      });
    } catch (error) {
      console.error('Error updating lead status:', error);
      res.status(500).json({ error: 'Failed to update lead status in FUB', details: error.message });
    }
  });

  router.get('/:id/conversation', requireAuth, async (req, res) => {
    if (!conversationService) {
      return res.status(503).json({ error: 'Conversation service not configured' });
    }

    const { id } = req.params;
    
    try {
      console.log(`\n📱 FRONTEND REQUESTING CONVERSATION for lead ${id}...`);
      
      let leadName = null;
      if (fubService) {
        try {
          const lead = await fubService.getLeadById(id);
          leadName = lead.name || lead.firstName || 'Lead';
          console.log(`   Lead name: ${leadName}`);
        } catch (err) {
          console.log('Could not fetch lead name');
        }
      }
      
      const history = await conversationService.fetchFullConversationHistory(id, leadName);
      console.log(`   Returning ${history.length} messages to frontend`);
      
      res.json({ 
        success: true, 
        conversationHistory: history,
        messageCount: history.length
      });
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      res.status(500).json({ error: 'Failed to fetch conversation history' });
    }
  });

  return router;
};