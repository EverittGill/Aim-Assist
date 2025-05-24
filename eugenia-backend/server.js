// eugenia-backend/server.js

require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
// We are using built-in fetch for Node.js v18+ (your Node v23 has it)

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS for all routes - allows your frontend to call this backend
app.use(express.json()); // To parse JSON request bodies

// Simple test route to check if the server is alive
app.get('/', (req, res) => {
  res.send('Hello from the Eugenia ISA Backend! The server is running.');
});

// --- API Route to Fetch Leads from FUB ---
app.get('/api/leads', async (req, res) => {
  console.log('GET /api/leads endpoint: Attempting to fetch real leads from FUB');

  const fubApiKey = process.env.FUB_API_KEY;
  const fubXSystem = process.env.FUB_X_SYSTEM;
  const fubXSystemKey = process.env.FUB_X_SYSTEM_KEY;

  if (!fubApiKey || !fubXSystem || !fubXSystemKey) {
    console.error('FUB API Key or custom X-System headers are missing in .env file');
    return res.status(500).json({ error: 'Server configuration error: FUB credentials missing.' });
  }

  // Encode API key for Basic Auth: API_KEY as username, empty password
  const basicAuth = Buffer.from(`${fubApiKey}:`).toString('base64');
  
  const fieldsToRequest = "id,name,firstName,lastName,stage,source,created,updated,lastCommunication,customFields,background,tags,emails,phones";
  const FUB_PEOPLE_URL = `https://api.followupboss.com/v1/people?limit=25&offset=0&sort=created&fields=${fieldsToRequest}`;

  try {
    const fubResponse = await fetch(FUB_PEOPLE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'X-System': fubXSystem,
        'X-System-Key': fubXSystemKey,
        'Content-Type': 'application/json',
        // Add cache-control headers to the request to FUB
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (!fubResponse.ok) {
      let errorDetails = `FUB API Error (${fubResponse.status}) after trying to fetch leads.`;
      try {
        const errorData = await fubResponse.json();
        errorDetails = `FUB API Error (${fubResponse.status}): ${errorData.message || errorData.title || JSON.stringify(errorData)}`;
      } catch (e) {
        // If response is not JSON, try to get text
        try {
            const errorText = await fubResponse.text();
            errorDetails = `FUB API Error (${fubResponse.status}): ${errorText || fubResponse.statusText}`;
        } catch (e2) {
            errorDetails = `FUB API Error (${fubResponse.status}): Failed to parse error response. Status: ${fubResponse.statusText}`;
        }
      }
      console.error(errorDetails);
      // Send a structured error back to the client
      return res.status(fubResponse.status).json({ error: 'Failed to fetch leads from FUB API.', details: errorDetails });
    }

    const data = await fubResponse.json();

    // Transform FUB data to the structure your frontend expects
    const processedLeads = data.people.map(p => ({
      id: p.id.toString(),
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      email: p.emails?.find(e => e.isPrimary)?.value || p.emails?.[0]?.value || null,
      phone: p.phones?.find(ph => ph.isPrimary)?.value || p.phones?.[0]?.value || null,
      status: p.stage || 'Unknown',
      fubLink: `https://app.followupboss.com/people/${p.id}`,
      lastContacted: p.lastCommunication?.createdDate || p.updated,
      notes: p.customFields?.find(cf => cf.name.toLowerCase() === 'notes')?.value || p.background || '',
      source: p.source || 'Unknown',
      tags: p.tags?.map(t => typeof t === 'string' ? t : t.name) || [],
      conversationHistory: [] // Initialize conversation history for now
    }));

    console.log(`Successfully fetched ${processedLeads.length} leads from FUB.`);
    
    // Set no-cache headers on the response TO THE FRONTEND
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({ leads: processedLeads });

  } catch (error) {
    // This catch block is for network errors with fetch itself or errors thrown from !fubResponse.ok
    console.error('General error in /api/leads route:', error.message);
    res.status(500).json({ error: 'Server error while trying to fetch leads from FUB.', details: error.message });
  }
});

// --- Other API routes will go below here later ---

app.listen(PORT, () => {
  console.log(`Eugenia Backend server is running on http://localhost:${PORT}`);
});