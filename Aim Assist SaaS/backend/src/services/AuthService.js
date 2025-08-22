/**
 * Multi-tenant authentication service
 * Now uses Supabase database instead of mock users
 * Handles JWT generation with tenant context
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const UserService = require('./database/UserService');
const TenantService = require('./database/TenantService');

class AuthService {
  constructor(jwtSecret) {
    if (!jwtSecret) {
      throw new Error('JWT secret is required for AuthService');
    }
    this.jwtSecret = jwtSecret;
    this.tokenExpiration = '7d'; // 7 days for persistent login
    this.userService = UserService;
    this.tenantService = TenantService;
    
    // Fallback mock users for when database is unavailable
    this.mockUsers = {
      'demo@aimassist.ai': {
        id: 'demo-user-fallback',
        email: 'demo@aimassist.ai',
        password: 'demo123',
        tenant_id: 'demo-tenant',
        tenant: {
          id: 'demo-tenant',
          name: 'Demo Company',
          slug: 'demo',
          is_active: true,
          settings: { agency_name: 'Demo Agency' }
        },
        role: 'admin'
      }
    };
  }

  /**
   * Hash password for storage
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generate JWT token with tenant context
   */
  generateToken(userId, tenantId, email, role = 'user') {
    const payload = {
      userId,
      tenantId, // Multi-tenant: Include tenant ID in token
      email,
      role,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiration
    });
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Refresh token (generate new token with same user data)
   */
  refreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, { ignoreExpiration: true });
      return this.generateToken(decoded.userId, decoded.tenantId, decoded.email, decoded.role);
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Authenticate user - Now uses Supabase database
   */
  async authenticateUser(email, password) {
    try {
      console.log(`🔐 Attempting authentication for: ${email}`);
      
      // Try database first
      try {
        const user = await this.userService.authenticateUser(email, password);
        
        if (user) {
          console.log(`✅ Database authentication successful for: ${email}`);
          return {
            userId: user.id,
            email: user.email,
            tenantId: user.tenant_id,
            tenantName: user.tenant.name,
            role: user.role,
            tenantConfig: {
              agency_name: user.tenant.settings?.agency_name || user.tenant.name,
              ...user.tenant.settings
            }
          };
        }
      } catch (dbError) {
        console.error('⚠️ Database authentication error:', dbError.message);
        
        // If it's an invalid credentials error, don't fall back to mock
        if (dbError.message === 'Invalid credentials') {
          throw dbError;
        }
        
        // For other errors (network, etc), try fallback
        console.log('⚠️ Falling back to mock authentication...');
      }

      // Fallback to mock users if database is unavailable
      const mockUser = this.mockUsers[email.toLowerCase()];
      
      if (mockUser && mockUser.password === password) {
        console.log(`✅ Mock authentication successful for: ${email}`);
        return {
          userId: mockUser.id,
          email: mockUser.email,
          tenantId: mockUser.tenant_id,
          tenantName: mockUser.tenant.name,
          role: mockUser.role,
          tenantConfig: {
            agency_name: mockUser.tenant.settings?.agency_name || 'Demo Agency',
            ...mockUser.tenant.settings
          }
        };
      }

      // No valid authentication found
      throw new Error('Invalid credentials');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  }

  /**
   * Get tenant configuration
   * Now fetches from database with fallback
   */
  async getTenantConfig(tenantId) {
    try {
      // Try database first
      const tenant = await this.tenantService.getTenantById(tenantId);
      
      if (tenant) {
        // Get additional configuration
        const [crmIntegrations, channels, aiConfig] = await Promise.all([
          this.tenantService.getCRMIntegrations(tenantId),
          this.tenantService.getCommunicationChannels(tenantId),
          this.tenantService.getAIConfiguration(tenantId)
        ]);

        return {
          id: tenant.id,
          name: tenant.name,
          agency_name: tenant.settings?.agency_name || tenant.name,
          settings: tenant.settings || {},
          crm_integrations: crmIntegrations,
          communication_channels: channels,
          ai_configuration: aiConfig,
          limits: {
            max_leads: tenant.max_leads,
            max_messages_per_month: tenant.max_messages_per_month,
            max_users: tenant.max_users
          }
        };
      }
    } catch (error) {
      console.error('⚠️ Failed to fetch tenant from database:', error);
    }

    // Fallback for demo tenant
    if (tenantId === 'demo-tenant') {
      console.log('⚠️ Using fallback demo tenant configuration');
      return {
        id: 'demo-tenant',
        name: 'Demo Agency',
        agency_name: process.env.DEFAULT_AGENCY_NAME || 'Demo Agency',
        settings: {},
        crm_integrations: [],
        communication_channels: [],
        ai_configuration: this.tenantService.getDefaultAIConfiguration(),
        limits: {
          max_leads: 100,
          max_messages_per_month: 1000,
          max_users: 5
        }
      };
    }

    throw new Error('Tenant not found');
  }

  /**
   * Middleware function for protecting routes with tenant context
   */
  createAuthMiddleware() {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      try {
        const decoded = this.verifyToken(token);
        
        // Validate tenant is still active
        const tenantStatus = await this.tenantService.validateTenantStatus(decoded.tenantId);
        
        if (!tenantStatus.valid) {
          return res.status(403).json({ 
            error: tenantStatus.reason || 'Account access denied' 
          });
        }
        
        // Attach user AND tenant context to request
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role
        };
        req.tenantId = decoded.tenantId; // Critical for multi-tenancy
        req.tenant = tenantStatus.tenant; // Full tenant object
        
        // Update user activity
        this.userService.updateLastActivity(decoded.userId).catch(err => {
          console.error('⚠️ Failed to update user activity:', err);
        });
        
        next();
      } catch (error) {
        return res.status(401).json({ error: error.message });
      }
    };
  }

  /**
   * Role-based access control middleware
   */
  requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: req.user.role
        });
      }

      next();
    };
  }

  /**
   * Permission-based access control
   */
  requirePermission(permission) {
    return async (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        // Get full user object with permissions
        const user = await this.userService.findUserById(req.user.id);
        
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        if (!this.userService.hasPermission(user, permission)) {
          return res.status(403).json({ 
            error: 'Insufficient permissions',
            required: permission
          });
        }

        // Update req.user with full permissions
        req.user.permissions = user.permissions || [];
        next();
      } catch (error) {
        console.error('❌ Permission check error:', error);
        return res.status(500).json({ error: 'Permission check failed' });
      }
    };
  }
}

module.exports = AuthService;