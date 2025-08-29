/**
 * Auto-Text Rules Management API
 * Endpoints for creating and managing automated text rules
 */

const express = require('express');
const router = express.Router();
const AutoTextRulesService = require('../services/AutoTextRulesService');
const { authenticateToken } = require('../middleware/auth');

/**
 * Get all rules for tenant
 * GET /api/auto-text/rules
 */
router.get('/rules', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || req.query.organization_id;
    
    const rules = await AutoTextRulesService.getRules(organizationId);
    
    res.json({
      success: true,
      rules,
      count: rules.length
    });
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({
      error: 'Failed to fetch rules',
      message: error.message
    });
  }
});

/**
 * Create a new rule
 * POST /api/auto-text/rules
 */
router.post('/rules', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || req.body.organization_id;
    
    const rule = await AutoTextRulesService.createRule(organizationId, req.body);
    
    res.json({
      success: true,
      rule,
      message: 'Rule created successfully (inactive by default)'
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({
      error: 'Failed to create rule',
      message: error.message
    });
  }
});

/**
 * Update a rule
 * PUT /api/auto-text/rules/:id
 */
router.put('/rules/:id', async (req, res) => {
  try {
    const ruleId = req.params.id;
    
    const rule = await AutoTextRulesService.updateRule(ruleId, req.body);
    
    res.json({
      success: true,
      rule,
      message: 'Rule updated successfully'
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({
      error: 'Failed to update rule',
      message: error.message
    });
  }
});

/**
 * Delete a rule
 * DELETE /api/auto-text/rules/:id
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const ruleId = req.params.id;
    
    await AutoTextRulesService.deleteRule(ruleId);
    
    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({
      error: 'Failed to delete rule',
      message: error.message
    });
  }
});

/**
 * Test a rule on a specific lead
 * POST /api/auto-text/rules/:id/test
 */
router.post('/rules/:id/test', async (req, res) => {
  try {
    const ruleId = req.params.id;
    const leadId = req.body.lead_id;
    
    if (!leadId) {
      return res.status(400).json({
        error: 'lead_id is required'
      });
    }
    
    const result = await AutoTextRulesService.testRule(ruleId, leadId);
    
    res.json({
      success: true,
      test_result: result
    });
  } catch (error) {
    console.error('Error testing rule:', error);
    res.status(500).json({
      error: 'Failed to test rule',
      message: error.message
    });
  }
});

/**
 * Create default safe rules for testing
 * POST /api/auto-text/create-defaults
 */
router.post('/create-defaults', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || req.body.organization_id;
    
    const defaultRules = [
      {
        name: 'Direct Connect Lead',
        description: 'Auto-text leads with Direct Connect tag',
        priority: 1,
        trigger_type: 'new_lead',
        trigger_conditions: { enable_ai: true },
        delay_minutes: 1,
        lead_tags: ['Direct Connect'],
        excluded_tags: ['VIP', 'DO_NOT_TEXT', 'MANUAL_ONLY', 'TEST'],
        message_template: 'Hi {firstName}, I saw you were looking at properties. How can I help you today?',
        max_sends_per_lead: 1,
        max_sends_per_day: 50
      },
      {
        name: 'PPC Lead',
        description: 'Auto-text leads from PPC campaigns',
        priority: 2,
        trigger_type: 'new_lead',
        trigger_conditions: { enable_ai: true },
        delay_minutes: 2,
        lead_sources: ['PPC', 'Google Ads', 'Facebook'],
        lead_tags: ['PPC'],
        excluded_tags: ['VIP', 'DO_NOT_TEXT', 'MANUAL_ONLY', 'TEST'],
        message_template: 'Hi {firstName}, thanks for your interest! What kind of property are you looking for?',
        max_sends_per_lead: 1,
        max_sends_per_day: 30
      },
      {
        name: 'Test Lead Rule',
        description: 'For testing - only texts leads with TEST tag',
        priority: 0, // Highest priority for testing
        trigger_type: 'new_lead',
        trigger_conditions: { enable_ai: true },
        delay_minutes: 0,
        lead_tags: ['TEST'],
        message_template: 'Test auto-text for {firstName}. This is a test message.',
        max_sends_per_lead: 5, // Allow multiple tests
        max_sends_per_day: 100
      }
    ];
    
    const created = [];
    for (const ruleData of defaultRules) {
      try {
        const rule = await AutoTextRulesService.createRule(organizationId, ruleData);
        created.push(rule);
      } catch (err) {
        console.error(`Failed to create rule ${ruleData.name}:`, err);
      }
    }
    
    res.json({
      success: true,
      message: `Created ${created.length} default rules (all inactive)`,
      rules: created
    });
  } catch (error) {
    console.error('Error creating default rules:', error);
    res.status(500).json({
      error: 'Failed to create default rules',
      message: error.message
    });
  }
});

/**
 * Apply rules to existing leads (manual trigger)
 * POST /api/auto-text/apply-to-existing
 */
router.post('/apply-to-existing', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || req.body.organization_id;
    const leadIds = req.body.lead_ids; // Optional: specific leads to check
    const tag = req.body.tag; // Optional: only check leads with this tag
    
    // Get leads to check
    const { supabase } = require('../config/supabase');
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    let query = supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('ai_status', 'inactive'); // Only check inactive leads
    
    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds);
    }
    
    if (tag) {
      query = query.contains('tags', [tag]);
    }
    
    query = query.limit(10); // Safety limit
    
    const { data: leads, error } = await query;
    
    if (error) throw error;
    
    const results = [];
    for (const lead of leads) {
      const result = await AutoTextRulesService.checkAndApplyRules(organizationId, lead);
      results.push({
        lead_id: lead.id,
        lead_name: `${lead.first_name} ${lead.last_name}`,
        ...result
      });
    }
    
    res.json({
      success: true,
      checked: leads.length,
      applied: results.filter(r => r.applied).length,
      results
    });
  } catch (error) {
    console.error('Error applying rules to existing leads:', error);
    res.status(500).json({
      error: 'Failed to apply rules',
      message: error.message
    });
  }
});

/**
 * Get rule statistics
 * GET /api/auto-text/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId || req.organizationId || req.query.organization_id;
    
    const { supabase } = require('../config/supabase');
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    // Get rule statistics
    const { data: rules, error: rulesError } = await supabase
      .from('auto_text_rules')
      .select('id, name, is_active, sends_count, responses_count, response_rate')
      .eq('organization_id', organizationId);
    
    if (rulesError) throw rulesError;
    
    // Get today's applications
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const { data: todayApps, error: appsError } = await supabase
      .from('auto_text_applications')
      .select('rule_id, status')
      .eq('organization_id', organizationId)
      .gte('created_at', startOfDay.toISOString());
    
    if (appsError) throw appsError;
    
    // Calculate stats
    const stats = {
      total_rules: rules.length,
      active_rules: rules.filter(r => r.is_active).length,
      total_sends: rules.reduce((sum, r) => sum + (r.sends_count || 0), 0),
      total_responses: rules.reduce((sum, r) => sum + (r.responses_count || 0), 0),
      sent_today: todayApps?.filter(a => a.status === 'sent').length || 0,
      scheduled_today: todayApps?.filter(a => a.status === 'scheduled').length || 0,
      rules
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

module.exports = router;