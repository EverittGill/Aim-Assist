const express = require('express');
const router = express.Router();
const CRMFactory = require('../services/crm/CRMFactory');
const LeadService = require('../services/LeadService');
const ConversationService = require('../services/ConversationService');
const TranslationService = require('../services/TranslationService');
const { supabase } = require('../config/supabase');

/**
 * Multi-tenant lead management routes
 * Each tenant has their own CRM connection and leads
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

  // Get all leads for tenant FROM SUPABASE
  router.get('/', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || req.query.tenant_id || 'demo-tenant';
      console.log(`Fetching leads from Supabase for tenant: ${tenantId}`);
      
      // Get CRM type for this tenant
      const adapter = await CRMFactory.getAdapter(tenantId);
      const crmType = adapter.crmType || 'fub';
      const translator = new TranslationService(crmType);
      const crmIdField = translator.getCRMLeadIdField();
      
      // Fetch leads from Supabase database (not CRM directly)
      const { data: leads, error } = await supabase
        .from('leads')
        .select(`
          *,
          conversations!conversations_lead_id_fkey (
            id,
            last_message_at,
            message_count,
            unread_count
          )
        `)
        .eq('organization_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (error) {
        console.error('Error fetching leads from Supabase:', error);
        throw error;
      }
      
      // Transform leads to frontend format
      const transformedLeads = (leads || []).map(lead => ({
        id: lead[crmIdField] || lead.id,
        db_id: lead.id, // Internal database ID
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Lead',
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.stage || 'new',
        ai_status: lead.ai_status || 'inactive',
        tags: lead.tags || [],
        last_contacted: lead.last_contacted_at,
        message_count: lead.conversations?.[0]?.message_count || 0,
        unread_count: lead.conversations?.[0]?.unread_count || 0,
        custom_fields: lead.crm_data || {},
        created_at: lead.created_at,
        updated_at: lead.updated_at
      }));
      
      console.log(`✅ Fetched ${transformedLeads.length} leads from Supabase`);
      res.json(transformedLeads);
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ 
        error: 'Failed to fetch leads', 
        details: error.message 
      });
    }
  });

  // Get single lead FROM SUPABASE
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      
      // Get CRM type for dynamic field lookup
      const adapter = await CRMFactory.getAdapter(tenantId);
      const crmType = adapter.crmType || 'fub';
      const translator = new TranslationService(crmType);
      const crmIdField = translator.getCRMLeadIdField();
      
      // Try to fetch by CRM ID first, then by database ID
      const { data: lead, error } = await supabase
        .from('leads')
        .select(`
          *,
          conversations!conversations_lead_id_fkey (
            id,
            last_message_at,
            message_count,
            unread_count
          )
        `)
        .eq('organization_id', tenantId)
        .or(`${crmIdField}.eq.${leadId},id.eq.${leadId}`)
        .single();
      
      if (error || !lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      // Transform to frontend format
      const transformedLead = {
        id: lead[crmIdField] || lead.id,
        db_id: lead.id,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Lead',
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.stage || 'new',
        ai_status: lead.ai_status || 'inactive',
        tags: lead.tags || [],
        last_contacted: lead.last_contacted_at,
        message_count: lead.conversations?.[0]?.message_count || 0,
        unread_count: lead.conversations?.[0]?.unread_count || 0,
        custom_fields: lead.crm_data || {},
        created_at: lead.created_at,
        updated_at: lead.updated_at
      };
      
      res.json(transformedLead);
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

  // Update lead IN SUPABASE FIRST
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = req.tenantId || 'demo-tenant';
      const leadId = req.params.id;
      const updates = req.body;
      
      // Get CRM type for dynamic field lookup
      const adapter = await CRMFactory.getAdapter(tenantId);
      const crmType = adapter.crmType || 'fub';
      const translator = new TranslationService(crmType);
      const crmIdField = translator.getCRMLeadIdField();
      
      // Update in Supabase first
      const { data: updatedLead, error } = await supabase
        .from('leads')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', tenantId)
        .or(`${crmIdField}.eq.${leadId},id.eq.${leadId}`)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      // Queue background job to sync to CRM
      // This ensures frontend gets immediate response
      try {
        await adapter.updateLead(updatedLead[crmIdField], updates);
        console.log('✅ Lead synced to CRM');
      } catch (crmError) {
        console.error('⚠️ Failed to sync to CRM (will retry):', crmError.message);
        // Could queue for retry here
      }
      
      res.json({ 
        success: true, 
        message: 'Lead updated successfully',
        lead: updatedLead
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
