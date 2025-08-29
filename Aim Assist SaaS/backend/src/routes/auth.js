const express = require('express');
const router = express.Router();

/**
 * Multi-tenant authentication routes
 * Handles login, token verification, and refresh
 */

module.exports = (authService) => {
  // Login endpoint
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
      const token = authService.generateToken(
        user.userId, 
        user.organizationId, 
        user.email, 
        user.role
      );
      
      // Return user, token, and tenant info for frontend
      res.json({ 
        success: true,
        token,
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          organization_id: user.organizationId
        },
        tenant: {
          id: user.organizationId,
          name: user.tenantName,
          settings: {
            agency_name: user.tenantConfig?.agency_name || 'Your Agency'
          }
        }
      });
    } catch (error) {
      console.error('Login error:', error.message);
      res.status(401).json({ error: error.message });
    }
  });

  // Verify token endpoint
  router.post('/verify', async (req, res) => {
    if (!authService) {
      return res.status(503).json({ error: 'Authentication service not configured' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body.token;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    try {
      const decoded = authService.verifyToken(token);
      
      // Get tenant config for the user
      const tenantConfig = await authService.getTenantConfig(decoded.organizationId);
      
      res.json({ 
        success: true,
        user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          organization_id: decoded.organizationId
        },
        tenant: {
          id: decoded.organizationId,
          name: tenantConfig.name,
          settings: {
            agency_name: tenantConfig.agency_name
          }
        }
      });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  });

  // Refresh token endpoint
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

  // Get current user endpoint
  router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = authService.verifyToken(token);
      const tenantConfig = await authService.getTenantConfig(decoded.organizationId);
      
      res.json({
        user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          organization_id: decoded.organizationId
        },
        tenant: {
          id: decoded.organizationId,
          name: tenantConfig.name,
          settings: {
            agency_name: tenantConfig.agency_name
          }
        }
      });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  });

  return router;
};