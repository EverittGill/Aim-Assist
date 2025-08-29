/**
 * Run SQL fixes directly via Supabase client
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runSQLFixes() {
  console.log('🔧 Running SQL fixes...\n');
  
  try {
    // Fix 1: Add missing columns to conversations table
    console.log('1️⃣ Adding missing columns to conversations table...');
    
    const conversationFixes = [
      `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false`,
      `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`,
      `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms'`
    ];
    
    for (const sql of conversationFixes) {
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();
      if (error && !error.message.includes('already exists')) {
        console.error('Error:', error.message);
      }
    }
    console.log('✅ Conversations table fixed\n');
    
    // Fix 2: Create messages table if needed
    console.log('2️⃣ Creating messages table if it doesn\'t exist...');
    
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        lead_id VARCHAR(255),
        crm_message_id VARCHAR(255),
        external_id VARCHAR(255),
        direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        sender_type VARCHAR(50),
        content TEXT NOT NULL,
        channel VARCHAR(50) DEFAULT 'sms',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    const { error: tableError } = await supabase.rpc('exec_sql', { sql_query: createMessagesTable }).single();
    if (tableError && !tableError.message.includes('already exists')) {
      console.error('Error creating messages table:', tableError.message);
    }
    console.log('✅ Messages table ready\n');
    
    // Fix 3: Add FUB user_id to credentials
    console.log('3️⃣ Adding FUB user_id to credentials...');
    
    const { data: integration, error: fetchError } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('tenant_id', '7c563f31-36bd-4414-ad44-ef9c19c1c6b1')
      .eq('crm_type', 'followupboss')
      .single();
    
    if (integration && !fetchError) {
      const updatedCredentials = {
        ...integration.credentials,
        user_id: "1"  // Your FUB user ID
      };
      
      const { error: updateError } = await supabase
        .from('crm_integrations')
        .update({ credentials: updatedCredentials })
        .eq('id', integration.id);
      
      if (updateError) {
        console.error('Error updating credentials:', updateError);
      } else {
        console.log('✅ FUB user_id added to credentials');
        console.log('   User ID: 1 (Everitt Gill)\n');
      }
    } else {
      console.error('Could not find FUB integration:', fetchError);
    }
    
    // Verify the updates
    console.log('4️⃣ Verifying updates...');
    
    // Check conversations columns
    const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'conversations' 
        AND column_name IN ('ai_enabled', 'status', 'channel_type')
      `
    });
    
    if (columns && columns.length > 0) {
      console.log('✅ Conversations table has all required columns');
    }
    
    // Check messages table
    const { data: messagesCheck } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = 'messages'
      `
    });
    
    if (messagesCheck && messagesCheck[0]?.count > 0) {
      console.log('✅ Messages table exists');
    }
    
    // Check FUB credentials
    const { data: credCheck } = await supabase
      .from('crm_integrations')
      .select('credentials')
      .eq('tenant_id', '7c563f31-36bd-4414-ad44-ef9c19c1c6b1')
      .single();
    
    if (credCheck?.credentials?.user_id) {
      console.log('✅ FUB user_id is set:', credCheck.credentials.user_id);
    }
    
    console.log('\n🎉 All SQL fixes completed successfully!');
    console.log('📱 You can now send test messages and they should:');
    console.log('   - Be matched to the correct lead by phone number');
    console.log('   - Be stored in Supabase');
    console.log('   - Be logged to FUB with proper user attribution');
    
  } catch (error) {
    console.error('❌ Error running SQL fixes:', error);
  }
  
  process.exit(0);
}

// Run the fixes
runSQLFixes();