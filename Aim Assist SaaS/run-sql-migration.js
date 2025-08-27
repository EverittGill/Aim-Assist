/**
 * Run SQL migrations directly on Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

async function executeSQLStatements(sql) {
  // Split SQL into individual statements (simple split on semicolon)
  const statements = sql
    .split(/;\s*$/m)
    .filter(stmt => stmt.trim().length > 0)
    .map(stmt => stmt.trim() + ';');
  
  const results = [];
  
  for (const statement of statements) {
    // Skip comments-only statements
    if (statement.replace(/--.*$/gm, '').trim().length === 0) {
      continue;
    }
    
    try {
      console.log(`\n📝 Executing: ${statement.substring(0, 50)}...`);
      
      // Use raw SQL execution via Supabase Admin API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          query: statement
        })
      });
      
      if (response.ok) {
        results.push({ statement: statement.substring(0, 50), status: 'success' });
        console.log('✅ Success');
      } else {
        // Try alternative approach - direct PostgreSQL protocol would be needed
        // For now, we'll need to use Supabase dashboard
        console.log('⚠️  Cannot execute via REST API, needs dashboard execution');
        results.push({ statement: statement.substring(0, 50), status: 'needs_dashboard' });
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      results.push({ statement: statement.substring(0, 50), status: 'error', error: error.message });
    }
  }
  
  return results;
}

async function runMigrationFile(filename) {
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', filename);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 Migration: ${filename}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📏 SQL Length: ${sql.length} characters`);
    
    // Since we can't execute raw SQL via REST API, let's prepare it for dashboard
    const outputPath = path.join(__dirname, 'supabase', 'migrations', `READY_${filename}`);
    
    // Add header comment
    const sqlWithHeader = `-- ========================================
-- Migration: ${filename}
-- Generated: ${new Date().toISOString()}
-- ========================================

${sql}

-- ========================================
-- End of Migration
-- ========================================`;
    
    fs.writeFileSync(outputPath, sqlWithHeader);
    
    console.log('\n⚠️  IMPORTANT: Supabase REST API doesn\'t support raw SQL execution.');
    console.log('📋 Migration file prepared at:', outputPath);
    console.log('\n📌 To run this migration:');
    console.log('   1. Go to your Supabase dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the contents of:', `READY_${filename}`);
    console.log('   4. Click "Run" to execute');
    
    return true;
  } catch (error) {
    console.error(`❌ Error reading migration: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  const migrationFile = process.argv[2] || '001_extensions_and_enums.sql';
  
  await runMigrationFile(migrationFile);
  
  console.log('\n📝 Next step: Run the migration in Supabase dashboard');
  console.log('🔗 Dashboard URL:', `https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql`);
}

main();