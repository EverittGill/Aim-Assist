// src/constants.js
export const AI_SENDER_NAME = "Eugenia";

// Initial mock leads (can be removed once backend is fully reliable for all scenarios)
export const MOCK_LEADS_INITIAL = [
  { id: '1', name: 'John Doe (Mock)', email: 'john.doe@example.com', phone: '+15551234567', status: 'New Lead', fubLink: 'https://app.followupboss.com/people/1', lastContacted: null, notes: 'Interested in 3-bed houses in downtown. Budget $500k.', source: 'Website', tags: ['Buyer', 'Downtown Interest', 'Pre-approved'], conversationHistory: [] },
  { id: '2', name: 'Jane Smith (Mock)', email: 'jane.smith@example.com', phone: '+15559876543', status: 'AI Initial Contact Sent', fubLink: 'https://app.followupboss.com/people/2', lastContacted: new Date(Date.now() - 3600000).toISOString(), notes: 'Looking for investment properties.', source: 'Zillow', tags: ['Investor', 'Multi-family'], conversationHistory: [{sender: AI_SENDER_NAME, text: 'Hi Jane, this is Eugenia from Your Awesome Realty! I saw you were interested in investment properties. What kind of returns are you targeting?', timestamp: new Date(Date.now() - 3600000).toISOString()}] },
];