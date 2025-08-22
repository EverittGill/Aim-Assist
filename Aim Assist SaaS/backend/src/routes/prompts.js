/**
 * AI Prompts Management API
 * Allows tenants to customize their AI conversation prompts
 */

const express = require('express');
const router = express.Router();
const PromptManager = require('../services/ai/PromptManager');

/**
 * GET /api/prompts
 * Get all prompts for the current tenant
 */
router.get('/', async (req, res) => {
  try {
    // For now, use default tenant ID - will add auth later
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    const prompts = await promptManager.getAllPrompts();
    
    res.json({
      success: true,
      prompts
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prompts'
    });
  }
});

/**
 * GET /api/prompts/:key
 * Get a specific prompt by key
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    
    const prompt = await promptManager.getPrompt(key);
    
    res.json({
      success: true,
      prompt: {
        key,
        template: prompt
      }
    });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prompt'
    });
  }
});

/**
 * POST /api/prompts
 * Create or update a custom prompt
 */
router.post('/', async (req, res) => {
  try {
    const { key, template, variables, category } = req.body;
    
    if (!key || !template) {
      return res.status(400).json({
        success: false,
        error: 'Key and template are required'
      });
    }
    
    // Validate template length for SMS
    if (template.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Template is too long (max 500 characters for base template)'
      });
    }
    
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    const savedPrompt = await promptManager.saveCustomPrompt(
      key,
      template,
      variables || [],
      category || 'custom'
    );
    
    res.json({
      success: true,
      prompt: savedPrompt
    });
  } catch (error) {
    console.error('Error saving prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save prompt'
    });
  }
});

/**
 * DELETE /api/prompts/:key
 * Reset a prompt to default
 */
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    
    const success = await promptManager.resetToDefault(key);
    
    if (success) {
      res.json({
        success: true,
        message: `Prompt ${key} reset to default`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to reset prompt'
      });
    }
  } catch (error) {
    console.error('Error resetting prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset prompt'
    });
  }
});

/**
 * POST /api/prompts/test
 * Test a prompt with sample data
 */
router.post('/test', async (req, res) => {
  try {
    const { template, variables } = req.body;
    
    if (!template) {
      return res.status(400).json({
        success: false,
        error: 'Template is required'
      });
    }
    
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    
    // Test variable substitution
    const sampleVariables = {
      agencyName: 'Test Agency',
      leadName: 'John Doe',
      leadSource: 'Website',
      currentMessage: 'I need a 3 bedroom home',
      conversationHistory: 'Assistant: Hi! How can I help?\nLead: Looking for homes',
      primaryGoal: 'Find out their timeline',
      daysSince: '3',
      leadInterest: '3BR homes under $500k',
      agentName: 'Sarah Smith',
      nextStep: 'call you to discuss options',
      timeframe: 'within the hour',
      appointmentType: 'property showing',
      ...variables
    };
    
    const result = promptManager.substituteVariables(template, sampleVariables);
    
    res.json({
      success: true,
      result,
      length: result.length,
      withinSMSLimit: result.length <= 160
    });
  } catch (error) {
    console.error('Error testing prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test prompt'
    });
  }
});

/**
 * GET /api/prompts/escalation/keywords
 * Get escalation keywords for the tenant
 */
router.get('/escalation/keywords', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || '7c563f31-36bd-4414-ad44-ef9c19c1c6b1';
    const promptManager = new PromptManager(tenantId);
    const keywords = await promptManager.getEscalationKeywords();
    
    res.json({
      success: true,
      keywords
    });
  } catch (error) {
    console.error('Error fetching escalation keywords:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch escalation keywords'
    });
  }
});

module.exports = router;