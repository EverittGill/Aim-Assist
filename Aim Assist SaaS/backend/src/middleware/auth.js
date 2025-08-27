const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

// Authenticate JWT token from Supabase
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Add user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

// For development/testing - skip auth if no token provided
const authenticateRequest = async (req, res, next) => {
  try {
    // In development, allow requests without auth
    if (process.env.NODE_ENV === 'development') {
      // Try to get tenant from headers or use default
      req.tenantId = req.headers['x-tenant-id'] || 1;
      
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          req.user = user;
        }
      }
      
      return next();
    }
    
    // Production - require authentication
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    req.tenantId = req.headers['x-tenant-id'] || user.user_metadata?.tenant_id || 1;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authenticateRequest
};