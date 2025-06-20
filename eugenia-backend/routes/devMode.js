const express = require('express');
const router = express.Router();
const devModeService = require('../services/devModeService');

module.exports = (requireAuth) => {
  // Enable/disable dev mode for a lead
  router.post('/', requireAuth, (req, res) => {
    const { leadId, enabled } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }
    
    const result = devModeService.setDevMode(leadId, enabled);
    res.json(result);
  });

  // Check dev mode status for a lead
  router.get('/:leadId', requireAuth, (req, res) => {
    const { leadId } = req.params;
    const enabled = devModeService.isDevModeEnabled(leadId);
    res.json({ leadId, devModeEnabled: enabled });
  });

  // Get all leads with dev mode enabled
  router.get('/', requireAuth, (req, res) => {
    const leads = devModeService.getDevModeLeads();
    res.json({ devModeLeads: leads });
  });

  return router;
};