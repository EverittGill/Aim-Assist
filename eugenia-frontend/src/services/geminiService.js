// src/services/geminiService.js
export const nurtureWithGemini = async (lead, currentConversation = [], geminiApiKey, userAgencyName, aiSenderName) => { 
  if (!geminiApiKey) { 
    throw new Error('Gemini API Key required.'); 
  }
  if (!lead) { 
    throw new Error('No lead selected for Gemini nurturing.'); 
  }

  // Correctly use conversationHistoryText
  let conversationHistoryText = "This is the beginning of the conversation.\n";
  if (currentConversation.length > 0) { 
    conversationHistoryText = currentConversation.map(msg => 
      `${msg.sender === aiSenderName ? aiSenderName : lead.name}: ${msg.text}`
    ).join('\n') + '\n'; 
  }
  const leadTagsString = lead.tags && lead.tags.length > 0 ? lead.tags.join(', ') : 'No specific tags';
  
  // Removed unnecessary escapes from the prompt string
  const prompt = `You are ${aiSenderName}, an expert real estate ISA for "${userAgencyName}". Your goal: engage lead, collect qualifying info (buy/sell, timeline, area/property type, pre-approved?), determine if ready for human agent. Lead Details: Name: ${lead.name}, Email: ${lead.email || 'N/A'}, Phone: ${lead.phone || 'N/A'}, CRM Status: "${lead.status}", CRM Notes: "${lead.notes || 'N/A'}", Source: ${lead.source || 'N/A'}, Tags: ${leadTagsString}. Conversation History (you are ${aiSenderName}): ${conversationHistoryText}${aiSenderName}: (Your response here. Concise, like SMS. One clear question or CTA.) Instructions: Start: friendly greeting, open question based on details. History: respond to last Lead message. Gather needs. Natural, conversational. Strong interest/request to speak: suggest connecting to agent. Rude/not interested: politely end. Output only your next message as ${aiSenderName}. No "${aiSenderName}:" prefix.`;
  
  try {
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`;
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      
      if (!response.ok) { 
        let eD=`HTTP ${response.status}`; 
        try{
          const eDt=await response.json();
          eD=`Gemini Err (${response.status}): ${eDt.error?.message || JSON.stringify(eDt)}`;
        } catch(e){
          eD=`Gemini Err (${response.status}): ${response.statusText || 'Failed to parse'}`;
        } 
        throw new Error(eD); 
      }
      const result = await response.json();
      if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
          const aiResponseText = result.candidates[0].content.parts[0].text.trim();
          return aiResponseText;
      } else { 
        throw new Error('Unexpected API response structure from Gemini.'); 
      }
  } catch (error) { 
    console.error("Error calling Gemini API:", error); 
    throw error;
  }
};