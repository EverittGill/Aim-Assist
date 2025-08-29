/**
 * Clean up messages that have JSON objects instead of text
 * and reset the lead's qualification state
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');

const TENANT_ID = 'e5669fe6-a161-4628-89e3-4b8e01f663b8';
const LEAD_PHONE = '+17068184445';

async function cleanMessages() {
  console.log('🧹 Cleaning up bad messages and resetting qualification...\n');
  
  try {
    // Get the lead
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('phone', LEAD_PHONE);
    
    if (!leads || leads.length === 0) {
      console.log('❌ Lead not found');
      return;
    }
    
    const leadId = leads[0].id;
    console.log(`Found lead: ${leadId}\n`);
    
    // Get conversation
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('lead_id', leadId);
    
    if (!conversations || conversations.length === 0) {
      console.log('❌ No conversation found');
      return;
    }
    
    const conversationId = conversations[0].id;
    console.log(`Found conversation: ${conversationId}\n`);
    
    // Get all messages
    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, direction')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });
    
    console.log(`Found ${messages?.length || 0} total messages\n`);
    
    // Find and fix bad messages
    let badCount = 0;
    let fixedCount = 0;
    
    for (const msg of messages || []) {
      // Check if content is a JSON object string
      if (typeof msg.content === 'string' && msg.content.startsWith('{')) {
        badCount++;
        console.log(`Found bad message ${msg.id}:`);
        
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.message) {
            // Extract just the message text
            const { error } = await supabase
              .from('messages')
              .update({ content: parsed.message })
              .eq('id', msg.id);
            
            if (!error) {
              fixedCount++;
              console.log(`  ✅ Fixed - extracted: "${parsed.message.substring(0, 50)}..."`);
            } else {
              console.log(`  ❌ Failed to fix: ${error.message}`);
            }
          }
        } catch (e) {
          console.log(`  ⚠️ Not valid JSON, keeping as is`);
        }
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`  Total messages: ${messages?.length || 0}`);
    console.log(`  Bad messages found: ${badCount}`);
    console.log(`  Messages fixed: ${fixedCount}`);
    
    // Reset conversation qualification status
    console.log('\n🔄 Resetting conversation qualification status...');
    const { error: convError } = await supabase
      .from('conversations')
      .update({
        qualification_status: null,
        qualified_at: null
      })
      .eq('id', conversationId);
    
    if (!convError) {
      console.log('✅ Conversation qualification reset');
    } else {
      console.log(`⚠️ Could not reset conversation: ${convError.message}`);
    }
    
    // Reset lead AI status
    console.log('\n🔄 Resetting lead AI status...');
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        ai_status: 'active',
        ai_paused_until: null
      })
      .eq('id', leadId);
    
    if (!leadError) {
      console.log('✅ Lead AI status reset to active');
    } else {
      console.log(`⚠️ Could not reset lead: ${leadError.message}`);
    }
    
    console.log('\n✅ Cleanup complete!');
    console.log('\n💡 The lead should now respond with NEW messages instead of the qualification message.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

cleanMessages();