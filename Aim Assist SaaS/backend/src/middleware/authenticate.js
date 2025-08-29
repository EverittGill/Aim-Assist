/**
 * Verifies Supabase JWT tokens
 * Extracts user ID and tenant ID from token
 * Attaches user object to request for downstream use
 */

const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

/**
 * Main authentication middleware
 * Verifies JWT token and attaches user context to request
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authorization header must include Bearer token'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // For development - accept test token only if explicitly enabled
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_TEST_AUTH === 'true' && token === 'test-token') {
      req.user = {
        id: process.env.TEST_USER_ID || 'dev-user',
        organization_id: process.env.TEST_ORG_ID || 'dev-org',
        email: process.env.TEST_EMAIL || 'dev@test.local',
        role: 'admin'
      };
      req.organizationId = req.user.organization_id;
      return next();
    }

    // Verify token with Supabase
    if (!supabase) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Authentication service is not configured'
      });
    }

    // Get user from Supabase auth
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed'
      });
    }

    // Get full user profile with tenant info from database
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select(`
        *,
        tenants (
          id,
          name,
          subdomain,
          subscription_status,
          subscription_plan
        )
      `)
      .eq('auth_id', user.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(401).json({
        error: 'User not found',
        message: 'No user profile found for this auth token'
      });
    }

    // Check if tenant is active
    if (userProfile.tenants?.subscription_status === 'cancelled') {
      return res.status(403).json({
        error: 'Subscription cancelled',
        message: 'Your organization\'s subscription has been cancelled'
      });
    }

    // Attach user and tenant info to request
    req.user = {
      id: userProfile.id,
      auth_id: user.id,
      email: userProfile.email,
      organization_id: userProfile.organization_id,
      role: userProfile.role,
      permissions: userProfile.permissions,
      tenant: userProfile.tenants
    };
    req.organizationId = userProfile.organization_id;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Used for endpoints that work with or without auth
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without user context
    return next();
  }

  // Token provided, try to authenticate
  authenticate(req, res, (err) => {
    if (err) {
      // Authentication failed, continue without user context
      return next();
    }
    next();
  });
}

/**
 * Require specific role
 * Must be used after authenticate middleware
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Requires one of these roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Require specific permission
 * Must be used after authenticate middleware
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Requires permission: ${permission}`
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission
};