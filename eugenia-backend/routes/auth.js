const express = require('express');
const router = express.Router();

module.exports = (authService) => {
  router.post('/login', async (req, res) => {
    if (!authService) {
      return res.status(503).json({ error: 'Authentication service not configured' });
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const user = await authService.authenticateUser(email, password);
      const token = authService.generateToken(user.userId, user.email);
      
      res.json({ 
        success: true,
        token,
        user: {
          id: user.userId,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error.message);
      res.status(401).json({ error: error.message });
    }
  });

  router.post('/verify', async (req, res) => {
    if (!authService) {
      return res.status(503).json({ error: 'Authentication service not configured' });
    }

    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    try {
      const decoded = authService.verifyToken(token);
      res.json({ 
        success: true,
        user: {
          id: decoded.userId,
          email: decoded.email
        }
      });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  });

  router.post('/refresh', async (req, res) => {
    if (!authService) {
      return res.status(503).json({ error: 'Authentication service not configured' });
    }

    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    try {
      const newToken = authService.refreshToken(token);
      res.json({ 
        success: true,
        token: newToken
      });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  });

  return router;
};