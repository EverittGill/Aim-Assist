/**
 * Supabase client configuration
 * Uses service key for backend operations
 * Exports authenticated client for database operations
 */

const { createClient } = require('@supabase/supabase-js');

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️ Missing Supabase environment variables: ${missingVars.join(', ')}`);
  console.warn('Database operations will not work until these are configured.');
}

// Create Supabase client with service key for full admin access
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null;

/**
 * Set the current tenant context for RLS policies
 * Must be called before any database operations
 * @param {string} tenantId - UUID of the current tenant
 */
async function setTenantContext(tenantId) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  // Set the tenant context for Row Level Security
  const { error } = await supabase.rpc('set_config', {
    parameter: 'app.current_tenant_id',
    value: tenantId
  });
  
  if (error) {
    throw new Error(`Failed to set tenant context: ${error.message}`);
  }
}

/**
 * Execute a database query with tenant isolation
 * @param {string} tenantId - UUID of the current tenant
 * @param {Function} queryFn - Function that executes the query
 */
async function withTenantContext(tenantId, queryFn) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  await setTenantContext(tenantId);
  return queryFn(supabase);
}

/**
 * Test database connection
 * @returns {boolean} - True if connected successfully
 */
async function testConnection() {
  if (!supabase) {
    return false;
  }
  
  try {
    const { error } = await supabase.from('tenants').select('count').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned (which is fine)
      console.error('Database connection test failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Database connection test error:', err);
    return false;
  }
}

module.exports = {
  supabase,
  setTenantContext,
  withTenantContext,
  testConnection
};