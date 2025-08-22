/**
 * Setup messages table in Supabase
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function setupMessagesTable() {
  console.log('📊 Setting up messages table...\n');
  
  try {
    // First check if table exists by trying to query it
    const { data: existing, error: checkError } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    if (checkError) {
      console.log('Messages table check error:', checkError.message);
      console.log('\n❌ Messages table needs to be created.');
      console.log('\nPlease run fix-messages-simple.sql in Supabase SQL editor.');
      return;
    }
    
    console.log('✅ Messages table exists');
    
    // Try to insert a test message to verify structure
    const testMessage = {
      tenant_id: '7c563f31-36bd-4414-ad44-ef9c19c1c6b1',
      conversation_id: '00000000-0000-0000-0000-000000000000',
      lead_id: 'd60a5117-b442-4ecf-b6b5-4cdd792e9873',  // Your lead 621's ID
      content: 'Test message',
      direction: 'inbound',
      channel_type: 'sms',
      from_phone: '+17068184445',
      to_phone: '+18662981158'
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert(testMessage)
      .select()
      .single();
    
    if (insertError) {
      console.error('\n❌ Error inserting test message:', insertError);
      console.log('\nThis means the table structure is wrong.');
      console.log('Please run fix-messages-simple.sql in Supabase.');
    } else {
      console.log('✅ Test message inserted successfully');
      console.log('Message ID:', inserted.id);
      
      // Delete the test message
      await supabase
        .from('messages')
        .delete()
        .eq('id', inserted.id);
      
      console.log('✅ Test message cleaned up');
      console.log('\n🎉 Messages table is properly configured!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

setupMessagesTable();