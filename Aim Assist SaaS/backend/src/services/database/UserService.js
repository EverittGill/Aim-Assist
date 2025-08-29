/**
 * UserService - Manages all user-related database operations
 * Handles authentication, user CRUD, and tenant association
 */

const bcrypt = require('bcryptjs');
const { supabase } = require('../../config/supabase');

class UserService {
  constructor() {
    this.supabase = supabase;
    this.userCache = new Map(); // Cache authenticated users briefly
    this.cacheTimeout = 60 * 1000; // 1 minute for security
  }

  /**
   * Find user by email within a tenant context
   * This is the primary method for login
   */
  async findUserByEmail(email, organizationId = null) {
    try {
      console.log(`🔍 Looking up user: ${email}${organizationId ? ` in tenant ${organizationId}` : ''}`);
      
      let query = this.supabase
        .from('users')
        .select(`
          *,
          tenant:tenants!inner(
            id,
            name,
            slug,
            subscription_tier,
            subscription_status,
            is_active,
            settings
          )
        `)
        .eq('email', email.toLowerCase())
        .eq('is_active', true);

      // If organizationId provided, filter by it
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`❌ User not found: ${email}`);
          return null;
        }
        console.error('❌ Database error finding user:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      console.log(`✅ User found: ${data.email} (${data.role}) in ${data.tenant.name}`);
      return data;
    } catch (error) {
      console.error('❌ UserService.findUserByEmail error:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findUserById(userId) {
    try {
      // Check cache first
      const cached = this.userCache.get(userId);
      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }

      const { data, error } = await this.supabase
        .from('users')
        .select(`
          *,
          tenant:tenants!inner(
            id,
            name,
            slug,
            subscription_tier,
            subscription_status,
            settings
          )
        `)
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Database error: ${error.message}`);
      }

      // Cache the user briefly
      this.userCache.set(userId, {
        data,
        expires: Date.now() + this.cacheTimeout
      });

      return data;
    } catch (error) {
      console.error('❌ UserService.findUserById error:', error);
      throw error;
    }
  }

  /**
   * Verify user password
   */
  async verifyPassword(plainPassword, hashedPassword) {
    try {
      if (!plainPassword || !hashedPassword) {
        return false;
      }
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('❌ Password verification error:', error);
      return false;
    }
  }

  /**
   * Authenticate user with email and password
   * Returns full user object with tenant info if successful
   */
  async authenticateUser(email, password) {
    try {
      console.log(`🔐 Authenticating user: ${email}`);
      
      // Find user by email (across all tenants)
      const user = await this.findUserByEmail(email);
      
      if (!user) {
        console.log(`❌ Authentication failed: User not found`);
        throw new Error('Invalid credentials');
      }

      // Check if tenant is active
      if (!user.tenant.is_active) {
        console.log(`❌ Authentication failed: Tenant suspended`);
        throw new Error('Account suspended');
      }

      // Verify password
      const passwordValid = await this.verifyPassword(password, user.password_hash);
      
      if (!passwordValid) {
        console.log(`❌ Authentication failed: Invalid password`);
        throw new Error('Invalid credentials');
      }

      // Update last login
      await this.updateLastLogin(user.id);

      console.log(`✅ Authentication successful: ${user.email}`);
      
      // Return user with tenant info
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        organization_id: user.organization_id,
        tenant: user.tenant,
        permissions: user.permissions || [],
        settings: user.settings || {}
      };
    } catch (error) {
      console.error('❌ UserService.authenticateUser error:', error);
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(userId) {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({ 
          last_login_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('⚠️ Failed to update last login:', error);
        // Don't throw - this shouldn't break authentication
      }
    } catch (error) {
      console.error('⚠️ UserService.updateLastLogin error:', error);
      // Don't throw - this shouldn't break authentication
    }
  }

  /**
   * Update user's last activity timestamp
   */
  async updateLastActivity(userId) {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({ 
          last_activity_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('⚠️ Failed to update last activity:', error);
      }
    } catch (error) {
      console.error('⚠️ UserService.updateLastActivity error:', error);
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    try {
      // Hash password if provided
      if (userData.password) {
        userData.password_hash = await bcrypt.hash(userData.password, 12);
        delete userData.password;
      }

      // Ensure email is lowercase
      userData.email = userData.email.toLowerCase();

      const { data, error } = await this.supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('User with this email already exists');
        }
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('❌ UserService.createUser error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId, updates) {
    try {
      // Don't allow updating certain fields
      delete updates.id;
      delete updates.organization_id;
      delete updates.created_at;
      
      // Hash password if being updated
      if (updates.password) {
        updates.password_hash = await bcrypt.hash(updates.password, 12);
        delete updates.password;
      }

      const { data, error } = await this.supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user: ${error.message}`);
      }

      // Clear cache
      this.userCache.delete(userId);

      return data;
    } catch (error) {
      console.error('❌ UserService.updateUser error:', error);
      throw error;
    }
  }

  /**
   * Get all users for a tenant
   */
  async getUsersByTenant(organizationId) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('❌ UserService.getUsersByTenant error:', error);
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  hasPermission(user, permission) {
    // Admin has all permissions
    if (user.role === 'admin') {
      return true;
    }

    // Check specific permissions array
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }

    // Default role-based permissions
    const rolePermissions = {
      manager: ['read', 'write', 'delete', 'manage_leads', 'manage_conversations'],
      agent: ['read', 'write', 'manage_leads', 'manage_conversations'],
      viewer: ['read']
    };

    const permissions = rolePermissions[user.role] || [];
    return permissions.includes(permission);
  }

  /**
   * Clear user cache
   */
  clearCache(userId = null) {
    if (userId) {
      this.userCache.delete(userId);
    } else {
      this.userCache.clear();
    }
  }
}

// Export singleton instance
module.exports = new UserService();