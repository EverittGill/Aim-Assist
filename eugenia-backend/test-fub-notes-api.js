require('dotenv').config();
const FUBService = require('./services/fubService');

// Initialize FUB service
const fubService = new FUBService(
  process.env.FUB_API_KEY,
  process.env.FUB_X_SYSTEM,
  process.env.FUB_X_SYSTEM_KEY,
  process.env.FUB_USER_ID
);

// Test lead ID - using Test Everitt as required
const TEST_LEAD_ID = '470';

async function testNotesAPI() {
  console.log('🧪 Testing FUB Notes API\n');
  
  try {
    // Test 1: Create a note using the /notes endpoint
    console.log('1️⃣ Creating a note via /notes API...');
    
    const noteData = {
      personId: parseInt(TEST_LEAD_ID),
      subject: 'SMS Conversation History',
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        messages: [
          {
            direction: 'inbound',
            content: 'Test message from lead',
            timestamp: new Date().toISOString()
          },
          {
            direction: 'outbound',
            content: 'Test response from AI',
            timestamp: new Date(Date.now() + 60000).toISOString()
          }
        ]
      }),
      isHtml: false
    };
    
    const response = await fetch('https://api.followupboss.com/v1/notes', {
      method: 'POST',
      headers: {
        ...fubService.getHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(noteData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create note: ${response.status} - ${errorText}`);
    }
    
    const createdNote = await response.json();
    console.log('   ✅ Note created successfully');
    console.log(`   Note ID: ${createdNote.id}`);
    console.log(`   Subject: ${createdNote.subject}`);
    
    // Test 2: Retrieve the note
    console.log('\n2️⃣ Retrieving the note...');
    
    const getResponse = await fetch(`https://api.followupboss.com/v1/notes/${createdNote.id}`, {
      method: 'GET',
      headers: fubService.getHeaders()
    });
    
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log(`   ❌ Failed to retrieve note: ${getResponse.status} - ${errorText}`);
    } else {
      const retrievedNote = await getResponse.json();
      console.log('   ✅ Note retrieved successfully');
      console.log(`   Body length: ${retrievedNote.body?.length || 0} chars`);
      
      // Try to parse the JSON body
      try {
        const parsedBody = JSON.parse(retrievedNote.body);
        console.log(`   Parsed messages: ${parsedBody.messages?.length || 0}`);
      } catch (e) {
        console.log('   Body is not JSON format');
      }
    }
    
    // Test 3: List notes for the lead
    console.log('\n3️⃣ Listing all notes for the lead...');
    
    const listResponse = await fetch(`https://api.followupboss.com/v1/notes?personId=${TEST_LEAD_ID}&limit=5&sort=-created`, {
      method: 'GET',
      headers: fubService.getHeaders()
    });
    
    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.log(`   ❌ Failed to list notes: ${listResponse.status}`);
    } else {
      const notesData = await listResponse.json();
      const notes = notesData.notes || [];
      console.log(`   ✅ Found ${notes.length} notes`);
      
      notes.forEach((note, index) => {
        console.log(`\n   Note ${index + 1}:`);
        console.log(`     ID: ${note.id}`);
        console.log(`     Subject: ${note.subject || 'No subject'}`);
        console.log(`     Created: ${note.created}`);
        console.log(`     Body preview: ${(note.body || '').substring(0, 100)}...`);
      });
    }
    
    // Compare with background field approach
    console.log('\n\n4️⃣ Comparing with background field approach...');
    
    console.log('\n📝 Notes API Approach:');
    console.log('   Pros:');
    console.log('   - Each conversation could be a separate note');
    console.log('   - Built-in timestamp and user tracking');
    console.log('   - Can have subject lines for organization');
    console.log('   Cons:');
    console.log('   - Multiple API calls needed');
    console.log('   - May have access restrictions');
    console.log('   - Harder to get full conversation history');
    console.log('   - Need to manage multiple note IDs');
    
    console.log('\n📋 Background Field Approach:');
    console.log('   Pros:');
    console.log('   - Single source of truth for all messages');
    console.log('   - One API call to get all history');
    console.log('   - No access restrictions');
    console.log('   - Atomic updates (all or nothing)');
    console.log('   - Better performance');
    console.log('   Cons:');
    console.log('   - Limited to 64KB total size');
    console.log('   - Need to manage storage ourselves');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run the test
testNotesAPI();