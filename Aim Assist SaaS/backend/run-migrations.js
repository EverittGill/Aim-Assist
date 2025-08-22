/**
 * Database Migration Runner for Supabase
 * Executes SQL migration files in order
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { supabase } = require('./src/config/supabase');

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');
  
  if (!supabase) {
    console.error('❌ Supabase client not initialized. Check your environment variables.');
    process.exit(1);
  }
  
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  
  try {
    // Read all migration files
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure they run in order
    
    if (sqlFiles.length === 0) {
      console.log('No migration files found.');
      return;
    }
    
    console.log(`Found ${sqlFiles.length} migration file(s)\n`);
    
    // Run each migration
    for (const file of sqlFiles) {
      console.log(`📝 Running migration: ${file}`);
      
      const filePath = path.join(migrationsDir, file);
      const sqlContent = await fs.readFile(filePath, 'utf8');
      
      // Split by semicolons but be careful with functions/triggers
      const statements = sqlContent
        .split(/;\s*$/m)
        .filter(stmt => stmt.trim())
        .map(stmt => stmt.trim() + ';');
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const statement of statements) {
        // Skip comments and empty statements
        if (statement.startsWith('--') || !statement.trim()) {
          continue;
        }
        
        try {
          // Use raw SQL execution via Supabase
          const { error } = await supabase.rpc('execute_sql', {
            query: statement
          }).single();
          
          if (error) {
            // If RPC doesn't exist, try direct execution (won't work with RLS)
            // This is a fallback for initial setup
            console.warn(`   ⚠️  Statement skipped (may need manual execution): ${statement.substring(0, 50)}...`);
            console.warn(`      Reason: ${error.message}`);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error(`   ❌ Error: ${err.message}`);
          errorCount++;
        }
      }
      
      if (errorCount === 0) {
        console.log(`   ✅ Migration completed successfully (${successCount} statements)\n`);
      } else {
        console.log(`   ⚠️  Migration completed with warnings (${successCount} successful, ${errorCount} skipped)\n`);
        console.log(`   Note: Some statements may need to be run directly in Supabase SQL Editor\n`);
      }
    }
    
    console.log('✨ All migrations processed!');
    console.log('\n📌 Important: Some SQL statements (especially DDL) need to be run directly in Supabase:');
    console.log('   1. Go to your Supabase Dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the migration file contents');
    console.log('   4. Click "Run" to execute\n');
    
    // Test the connection to new tables
    console.log('🔍 Verifying migration results...\n');
    
    const tables = ['tenants', 'users', 'leads', 'messages', 'conversations'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1);
      if (!error) {
        console.log(`   ✅ Table '${table}' is accessible`);
      } else if (error.code === 'PGRST205') {
        console.log(`   ❌ Table '${table}' not found - run migration in Supabase SQL Editor`);
      } else {
        console.log(`   ⚠️  Table '${table}': ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Add a helper function for direct SQL execution
async function createExecuteSqlFunction() {
  console.log('Creating helper function for SQL execution...');
  
  const createFunction = `
    CREATE OR REPLACE FUNCTION execute_sql(query text)
    RETURNS void AS $$
    BEGIN
      EXECUTE query;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  // This won't work via the client, but we'll provide instructions
  console.log('\n📝 To enable SQL execution via the API, run this in Supabase SQL Editor:');
  console.log('```sql');
  console.log(createFunction);
  console.log('```\n');
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('\n✅ Migration runner completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration runner failed:', err);
    process.exit(1);
  });