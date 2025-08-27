#!/usr/bin/env node
/**
 * Fix messages table schema - add missing columns
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function fixMessagesTable() {
  console.log('\n🔧 FIXING MESSAGES TABLE SCHEMA\n');
  
  // SQL to add missing columns
  const alterTableSQL = `
    -- Add missing columns to messages table
    ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms',
    ADD COLUMN IF NOT EXISTS sender_type VARCHAR(50) DEFAULT 'lead',
    ADD COLUMN IF NOT EXISTS provider_sid TEXT,
    ADD COLUMN IF NOT EXISTS from_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS to_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    
    -- Add indexes for performance
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_organization_id ON messages(organization_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
  `;
  
  try {
    // Execute the SQL directly
    const { error } = await supabase.rpc('exec_sql', {
      sql: alterTableSQL
    });
    
    if (error) {
      // If RPC doesn't exist, try direct approach
      console.log('⚠️ Cannot execute SQL via RPC, please run this SQL manually in Supabase SQL editor:');
      console.log('\n' + alterTableSQL + '\n');
    } else {
      console.log('✅ Messages table schema updated successfully');
    }
    
    // Test by trying to insert a message
    console.log('\n📝 Testing message insertion...');
    const testMessage = {
      conversation_id: '7d6012c9-fc44-4d50-833a-4101956e5a47',
      organization_id: '655cd229-b2e9-4737-843b-7488fe9d33e6',
      lead_id: 'cee14fb8-85f7-4710-84f5-e994c274de0c',
      direction: 'outbound',
      message_type: 'text',
      sender_type: 'ai',
      content: 'Test message after schema fix',
      channel_type: 'sms',
      provider_sid: 'TEST123',
      metadata: { test: true }
    };
    
    const { data, error: insertError } = await supabase
      .from('messages')
      .insert([testMessage])
      .select();
    
    if (insertError) {
      console.log('❌ Insert test failed:', insertError.message);
      console.log('\nPlease run this SQL in Supabase dashboard:');
      console.log(alterTableSQL);
    } else {
      console.log('✅ Test message inserted successfully');
      
      // Delete test message
      await supabase
        .from('messages')
        .delete()
        .eq('provider_sid', 'TEST123');
      console.log('✅ Test message cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nPlease run this SQL in your Supabase dashboard:');
    console.log(alterTableSQL);
  }
}

fixMessagesTable();
