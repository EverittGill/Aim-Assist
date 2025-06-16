module.exports = (services) => {
  const { authService, fubService, conversationService, geminiService, twilioService } = services;
  
  const requireAuth = require('../middleware/auth')(authService);
  
  return {
    auth: require('./auth')(authService),
    leads: require('./leads')(fubService, conversationService, requireAuth),
    ai: require('./ai')(geminiService, twilioService, fubService, conversationService, requireAuth),
    webhooks: require('./webhooks')(twilioService)
  };
};