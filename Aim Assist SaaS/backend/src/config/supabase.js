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
const supabase = process.env.SUPABASE_URL && 
                 process.env.SUPABASE_SERVICE_KEY && 
                 process.env.SUPABASE_URL !== 'your_supabase_project_url' &&
                 process.env.SUPABASE_SERVICE_KEY !== 'your_supabase_service_key'
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
 * @param {string} organizationId - UUID of the current organization
 */
async function setOrganizationContext(organizationId) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  // Set the tenant context for Row Level Security
  const { error } = await supabase.rpc('set_config', {
    parameter: 'app.current_organization_id',
    value: organizationId
  });
  
  if (error) {
    throw new Error(`Failed to set organization context: ${error.message}`);
  }
}

/**
 * Execute a database query with tenant isolation
 * @param {string} organizationId - UUID of the current organization
 * @param {Function} queryFn - Function that executes the query
 */
async function withOrganizationContext(organizationId, queryFn) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  await setOrganizationContext(organizationId);
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
    const { error } = await supabase.from('organizations').select('count').limit(1);
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
  setOrganizationContext,
  withOrganizationContext,
  testConnection
};