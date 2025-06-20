require('dotenv').config();
const FUBService = require('./services/fubService');

// Initialize FUB service
const fubService = new FUBService(
  process.env.FUB_API_KEY,
  process.env.FUB_X_SYSTEM,
  process.env.FUB_X_SYSTEM_KEY,
  process.env.FUB_USER_ID
);

// Test lead ID
const TEST_LEAD_ID = '470';

async function checkLeadFields() {
  console.log('🔍 Checking available fields for lead...\n');
  
  try {
    // Get lead with all fields
    const url = `https://api.followupboss.com/v1/people/${TEST_LEAD_ID}?fields=allFields`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: fubService.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch lead: ${response.status}`);
    }
    
    const lead = await response.json();
    
    // List all fields
    console.log('Available fields on lead object:');
    console.log('=' .repeat(50));
    
    Object.keys(lead).forEach(key => {
      const value = lead[key];
      const valuePreview = value ? 
        (typeof value === 'string' ? value.substring(0, 50) : JSON.stringify(value).substring(0, 50)) 
        : 'null';
      console.log(`${key}: ${valuePreview}${value && valuePreview.length === 50 ? '...' : ''}`);
    });
    
    // Check specifically for notes-related fields
    console.log('\n\nNotes-related fields:');
    console.log('=' .repeat(50));
    
    const noteFields = ['notes', 'background', 'description', 'comments'];
    noteFields.forEach(field => {
      if (lead[field] !== undefined) {
        console.log(`${field}: ${lead[field] ? 'Has content' : 'Empty'}`);
        if (lead[field]) {
          console.log(`  Content: ${lead[field].substring(0, 200)}${lead[field].length > 200 ? '...' : ''}`);
        }
      } else {
        console.log(`${field}: Not found`);
      }
    });
    
    // Check custom fields
    console.log('\n\nCustom fields:');
    console.log('=' .repeat(50));
    
    if (lead.customFields && Array.isArray(lead.customFields)) {
      lead.customFields.forEach(cf => {
        console.log(`${cf.name}: ${cf.value || 'null'}`);
      });
    } else {
      console.log('No custom fields found');
    }
    
    // Check if there's a separate notes array
    if (lead.notes && Array.isArray(lead.notes)) {
      console.log('\n\nNotes array found:');
      console.log('=' .repeat(50));
      console.log(`Number of notes: ${lead.notes.length}`);
      lead.notes.slice(0, 3).forEach((note, index) => {
        console.log(`\nNote ${index + 1}:`);
        console.log(`  Created: ${note.created}`);
        console.log(`  Body: ${note.body?.substring(0, 100)}${note.body?.length > 100 ? '...' : ''}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the check
checkLeadFields();