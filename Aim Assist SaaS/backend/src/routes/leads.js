const express = require('express');
const router = express.Router();
const CRMFactory = require('../services/crm/CRMFactory');
const LeadService = require('../services/LeadService');
const ConversationService = require('../services/ConversationService');

/**
 * Multi-tenant lead management routes
 * Each tenant has their own CRM connection and leads
 */

module.exports = (authService) => {
  const requireAuth = authService?.createAuthMiddleware() || ((req, res, next) => next());

  // Get all leads for tenant
  router.get('/', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || req.query.tenant_id || 'demo-tenant';
      console.log(`Fetching leads for tenant: ${tenantId}`);

      // Get tenant's CRM adapter
      const adapter = await CRMFactory.getAdapter(tenantId);
      
      // Fetch leads from CRM
      const leads = await adapter.getLeads({ limit: 100 });
      
      // Transform leads to standard format
      const transformedLeads = leads.map(lead => ({
        id: lead.crm_lead_id || lead.id,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Lead',
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.stage || 'new',
        ai_status: lead.crm_data?.customEugeniaTalkingStatus || 'inactive',
        tags: lead.tags || [],
        last_contacted: lead.crm_data?.lastActivity,
        message_count: 0,
        unread_count: 0,
        custom_fields: lead.crm_data || {}
      }));
      
      res.json(transformedLeads);
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ 
        error: 'Failed to fetch leads', 
        details: error.message 
      });
    }
  });

  // Get single lead
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      
      const adapter = await CRMFactory.getAdapter(tenantId);
      const lead = await adapter.getLeadById(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      res.json(lead);
    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({ 
        error: 'Failed to fetch lead', 
        details: error.message 
      });
    }
  });

  // Create new lead
  router.post('/', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadData = req.body;
      
      const adapter = await CRMFactory.getAdapter(tenantId);
      const newLead = await adapter.createLead(leadData);
      
      res.json({ 
        success: true, 
        lead: newLead 
      });
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ 
        error: 'Failed to create lead', 
        details: error.message 
      });
    }
  });

  // Update lead
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      const updates = req.body;
      
      const adapter = await CRMFactory.getAdapter(tenantId);
      await adapter.updateLead(leadId, updates);
      
      res.json({ 
        success: true, 
        message: 'Lead updated successfully' 
      });
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ 
        error: 'Failed to update lead', 
        details: error.message 
      });
    }
  });

  // Update lead AI status
  router.put('/:id/status', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      
      // Update AI status in local database
      await LeadService.updateAIStatus(leadId, status);
      
      // Also update in CRM if field configured
      const adapter = await CRMFactory.getAdapter(tenantId);
      const fieldName = process.env.FUB_EUGENIA_TALKING_STATUS_FIELD_NAME;
      
      if (fieldName && adapter.updateCustomField) {
        await adapter.updateCustomField(leadId, fieldName, status);
      }
      
      res.json({ 
        success: true, 
        message: 'Lead status updated',
        aiStatus: status 
      });
    } catch (error) {
      console.error('Error updating lead status:', error);
      res.status(500).json({ 
        error: 'Failed to update lead status', 
        details: error.message 
      });
    }
  });

  // Delete lead
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      
      const adapter = await CRMFactory.getAdapter(tenantId);
      await adapter.deleteLead(leadId);
      
      res.json({ 
        success: true, 
        message: 'Lead deleted successfully' 
      });
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ 
        error: 'Failed to delete lead', 
        details: error.message 
      });
    }
  });

  return router;
};
