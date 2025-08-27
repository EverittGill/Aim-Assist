/**
 * Debug why qualification keeps triggering
 */

require('dotenv').config();
const { supabase } = require('./src/config/supabase');
const QualificationService = require('./src/services/QualificationService');

const TENANT_ID = 'e5669fe6-a161-4628-89e3-4b8e01f663b8';
const CONVERSATION_ID = '649aaf5c-cbc5-4f57-859f-d88e76b67cfc';

async function debugQualification() {
  console.log('🔍 Debugging qualification logic...\n');
  
  // Get messages
  const { data: messages } = await supabase
    .from('messages')
    .select('content, direction, sender_type')
    .eq('conversation_id', CONVERSATION_ID)
    .order('created_at', { ascending: true });
  
  console.log(`Found ${messages?.length || 0} messages\n`);
  
  // Show what's being analyzed
  console.log('Messages being analyzed for qualification:');
  console.log('-'.repeat(50));
  
  const qualService = new QualificationService(TENANT_ID);
  
  // Only analyze INBOUND messages from lead
  const leadMessages = messages?.filter(m => 
    m.direction === 'inbound' || m.sender_type === 'lead'
  );
  
  console.log(`\n${leadMessages?.length || 0} lead messages to analyze:\n`);
  
  leadMessages?.forEach((msg, i) => {
    const content = msg.content?.substring(0, 100);
    console.log(`${i+1}. ${content}`);
    
    // Check for phone keywords
    const phoneKeywords = ['call me', 'phone', 'talk', 'speak', 'number', 'reach me'];
    const matches = phoneKeywords.filter(kw => 
      msg.content?.toLowerCase().includes(kw)
    );
    
    if (matches.length > 0) {
      console.log(`   ⚠️ MATCHES PHONE KEYWORDS: [${matches.join(', ')}]`);
    }
  });
  
  // Now analyze them
  console.log('\n' + '='.repeat(50));
  console.log('Running qualification analysis...');
  console.log('='.repeat(50));
  
  const qualification = await qualService.analyzeConversation(messages || []);
  
  console.log('\nQualification Results:');
  console.log(`  phoneInterest: ${qualification.phoneInterest}`);
  console.log(`  isQualified: ${qualification.isQualified}`);
  console.log(`  escalationReason: ${qualification.escalationReason}`);
  console.log(`  qualificationScore: ${qualification.qualificationScore}`);
  
  if (qualification.phoneInterest) {
    console.log('\n❌ PROBLEM: System thinks lead wants a phone call!');
    console.log('This is why you keep getting the qualification message.');
  }
  
  process.exit(0);
}

debugQualification();