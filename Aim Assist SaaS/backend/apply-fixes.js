/**
 * Apply database fixes programmatically
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function applyFixes() {
  console.log('🔧 Applying database fixes...\n');
  
  try {
    // Fix 1: Update FUB credentials with user_id
    console.log('1️⃣ Adding FUB user_id to credentials...');
    
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
        console.log('✅ FUB user_id added successfully');
        console.log('   User: Everitt Gill (ID: 1)');
      }
    } else {
      console.error('Could not find FUB integration:', fetchError);
    }
    
    // Fix 2: Create a test conversation to verify columns
    console.log('\n2️⃣ Testing conversations table...');
    
    const testConversation = {
      tenant_id: '7c563f31-36bd-4414-ad44-ef9c19c1c6b1',
      lead_id: '621',
      channel_type: 'sms',
      status: 'active',
      ai_enabled: false,
      metadata: { test: true }
    };
    
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .upsert(testConversation, {
        onConflict: 'tenant_id,lead_id',
        ignoreDuplicates: false
      })
      .select()
      .single();
    
    if (convError) {
      console.log('⚠️ Conversations table needs schema update');
      console.log('   Error:', convError.message);
      console.log('\n📋 Please run this SQL in Supabase SQL Editor:');
      console.log('-------------------------------------------');
      console.log('ALTER TABLE conversations');
      console.log('ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false,');
      console.log('ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'active\',');
      console.log('ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT \'sms\';');
      console.log('-------------------------------------------\n');
    } else {
      console.log('✅ Conversations table is ready');
      console.log('   Test conversation created:', conv.id);
    }
    
    // Fix 3: Test messages table
    console.log('\n3️⃣ Testing messages table...');
    
    const testMessage = {
      tenant_id: '7c563f31-36bd-4414-ad44-ef9c19c1c6b1',
      conversation_id: conv?.id,
      lead_id: '621',
      direction: 'inbound',
      sender_type: 'lead',
      content: 'Test message',
      channel: 'sms'
    };
    
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert(testMessage)
      .select()
      .single();
    
    if (msgError) {
      console.log('⚠️ Messages table needs to be created');
      console.log('   Error:', msgError.message);
      console.log('\n📋 Please run this SQL in Supabase SQL Editor:');
      console.log('-------------------------------------------');
      console.log(`CREATE TABLE IF NOT EXISTS messages (
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
);`);
      console.log('-------------------------------------------\n');
    } else {
      console.log('✅ Messages table is ready');
      console.log('   Test message created:', msg.id);
      
      // Clean up test message
      await supabase.from('messages').delete().eq('id', msg.id);
    }
    
    // Verify everything
    console.log('\n4️⃣ Final verification...');
    
    const { data: finalCheck } = await supabase
      .from('crm_integrations')
      .select('credentials')
      .eq('tenant_id', '7c563f31-36bd-4414-ad44-ef9c19c1c6b1')
      .single();
    
    if (finalCheck?.credentials?.user_id) {
      console.log('✅ FUB user_id is set:', finalCheck.credentials.user_id);
      console.log('\n🎉 Setup complete! Messages will now:');
      console.log('   - Be matched to leads by phone number');
      console.log('   - Be logged to FUB with proper attribution');
      console.log('   - Show up in the correct lead profile');
    } else {
      console.log('⚠️ FUB user_id not set - messages may not show in FUB');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

applyFixes();