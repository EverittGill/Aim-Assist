require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function listAllTables() {
  console.log('🔍 Fetching all tables from Supabase...\n');
  
  try {
    // Query to get all public tables
    const { data, error } = await supabase
      .rpc('get_all_tables', {}, { count: 'exact' });
    
    if (error) {
      // Fallback to direct SQL query if RPC doesn't exist
      const query = `
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `;
      
      const { data: tables, error: sqlError } = await supabase
        .rpc('query', { sql: query });
      
      if (sqlError) {
        console.error('❌ Error fetching tables:', sqlError);
        
        // Last resort: try known tables
        console.log('📋 Testing known tables...\n');
        await testKnownTables();
        return;
      }
      
      if (tables && tables.length > 0) {
        console.log('✅ Found tables via SQL query:');
        tables.forEach(row => {
          console.log(`  - ${row.tablename}`);
        });
      }
    } else if (data) {
      console.log('✅ Found tables:');
      data.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n📋 Testing known tables instead...\n');
    await testKnownTables();
  }
}

async function testKnownTables() {
  const knownTables = [
    'organizations',
    'tenants',
    'users',
    'leads',
    'messages',
    'conversations',
    'auto_text_rules',
    'auto_text_applications',
    'tag_polling_configs',
    'phone_numbers',
    'templates',
    'sync_history',
    'usage_metrics',
    'usage_tracking',
    'extraction_logs',
    'crm_integrations',
    'audit_logs',
    'ai_configurations',
    'communication_channels',
    'lead_qualifications'
  ];
  
  console.log('Testing existence of known tables:\n');
  
  for (const table of knownTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('count(*)', { count: 'exact', head: true });
      
      if (error) {
        if (error.message.includes('does not exist') || error.message.includes('not found')) {
          console.log(`❌ ${table}: DOES NOT EXIST`);
        } else {
          console.log(`⚠️  ${table}: ${error.message}`);
        }
      } else {
        console.log(`✅ ${table}: EXISTS`);
      }
    } catch (e) {
      console.log(`❌ ${table}: ${e.message}`);
    }
  }
}

// Run the script
listAllTables().then(() => {
  console.log('\n✨ Done!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});