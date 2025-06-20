const express = require('express');
const promptService = require('../services/promptService');

module.exports = function(requireAuth) {
  const router = express.Router();

  // Get all prompts
  router.get('/', requireAuth, async (req, res) => {
    try {
      const prompts = await promptService.getPrompts();
      res.json({ success: true, prompts });
    } catch (error) {
      console.error('Error fetching prompts:', error);
      res.status(500).json({ error: 'Failed to fetch prompts' });
    }
  });

  // Get a specific prompt
  router.get('/:promptName', requireAuth, async (req, res) => {
    try {
      const { promptName } = req.params;
      const prompt = promptService.getPromptTemplate(promptName);
      
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      res.json({ success: true, prompt });
    } catch (error) {
      console.error('Error fetching prompt:', error);
      res.status(500).json({ error: 'Failed to fetch prompt' });
    }
  });

  // Update a prompt
  router.put('/:promptName', requireAuth, async (req, res) => {
    try {
      const { promptName } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Prompt content is required' });
      }

      const result = await promptService.updatePrompt(promptName, content);
      res.json(result);
    } catch (error) {
      console.error('Error updating prompt:', error);
      res.status(500).json({ error: 'Failed to update prompt' });
    }
  });

  // Update escalation keywords
  router.put('/settings/escalation-keywords', requireAuth, async (req, res) => {
    try {
      const { keywords } = req.body;

      if (!Array.isArray(keywords)) {
        return res.status(400).json({ error: 'Keywords must be an array' });
      }

      const result = await promptService.updateEscalationKeywords(keywords);
      res.json(result);
    } catch (error) {
      console.error('Error updating escalation keywords:', error);
      res.status(500).json({ error: 'Failed to update keywords' });
    }
  });

  // Reset to defaults
  router.post('/reset', requireAuth, async (req, res) => {
    try {
      const result = await promptService.resetToDefaults();
      res.json(result);
    } catch (error) {
      console.error('Error resetting prompts:', error);
      res.status(500).json({ error: 'Failed to reset prompts' });
    }
  });

  // Test prompt substitution
  router.post('/test/:promptName', requireAuth, async (req, res) => {
    try {
      const { promptName } = req.params;
      const { testData } = req.body;

      const promptFunc = promptService.getExecutablePrompt(promptName);
      if (!promptFunc) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      // Use test data or default test data
      const params = testData || {
        agencyName: 'Test Agency',
        leadDetails: {
          id: '123',
          name: 'John Doe',
          firstName: 'John',
          tags: ['buyer', 'motivated'],
          source: 'website'
        },
        conversationHistory: 'John: Hi, I\'m interested in homes\nEugenia: Hi John! Great to hear from you.',
        currentMessage: 'What areas do you cover?',
        messageCount: 2,
        totalMessages: 3
      };

      const result = promptFunc(params);
      
      res.json({ 
        success: true, 
        prompt: result,
        length: result.length,
        estimatedTokens: Math.ceil(result.length / 4)
      });
    } catch (error) {
      console.error('Error testing prompt:', error);
      res.status(500).json({ error: 'Failed to test prompt' });
    }
  });

  return router;
};