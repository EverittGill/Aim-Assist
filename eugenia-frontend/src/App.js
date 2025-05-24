// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Bot, Send, User, Settings, ChevronDown, ChevronUp, Mail, Phone, ExternalLink, Copy, Check, Tag, Brain, PlusCircle, Trash2, MessageCircle, RefreshCw, UserCheck } from 'lucide-react';

// Mock Data - Used if backend calls are simulated or fail initially
const MOCK_LEADS_INITIAL = [
  { id: '1', name: 'John Doe (Mock)', email: 'john.doe@example.com', phone: '+15551234567', status: 'New Lead', fubLink: 'https://app.followupboss.com/people/1', lastContacted: null, notes: 'Interested in 3-bed houses in downtown. Budget $500k.', source: 'Website', tags: ['Buyer', 'Downtown Interest', 'Pre-approved'], conversationHistory: [] },
  { id: '2', name: 'Jane Smith (Mock)', email: 'jane.smith@example.com', phone: '+15559876543', status: 'AI Initial Contact Sent', fubLink: 'https://app.followupboss.com/people/2', lastContacted: new Date(Date.now() - 3600000).toISOString(), notes: 'Looking for investment properties.', source: 'Zillow', tags: ['Investor', 'Multi-family'], conversationHistory: [{sender: 'Eugenia', text: 'Hi Jane, this is Eugenia from Your Awesome Realty! I saw you were interested in investment properties. What kind of returns are you targeting?', timestamp: new Date(Date.now() - 3600000).toISOString()}] },
];

const AI_SENDER_NAME = "Eugenia";
const BACKEND_API_BASE_URL = 'http://localhost:3001/api'; // Ensure this matches your backend port

const getFromLocalStorage = (key, defaultValue) => { try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : defaultValue; } catch (error) { console.warn(`Error reading localStorage key "${key}":`, error); return defaultValue; } };
const setToLocalStorage = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn(`Error setting localStorage key "${key}":`, error); } };

const App = () => {
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [geminiMessage, setGeminiMessage] = useState(''); 
  const [leadReply, setLeadReply] = useState(''); 
  
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [isLoadingGemini, setIsLoadingGemini] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isProcessingNewLeads, setIsProcessingNewLeads] = useState(false);
  const [isPerformingBackendAction, setIsPerformingBackendAction] = useState(false);
  const [systemMessage, setSystemMessage] = useState({ type: '', text: '' });

  const [fubApiKey, setFubApiKey] = useState(() => getFromLocalStorage('fubApiKey_isa', ''));
  const [geminiApiKey, setGeminiApiKey] = useState(() => getFromLocalStorage('geminiApiKey_isa', ''));
  const [userAgencyName, setUserAgencyName] = useState(() => getFromLocalStorage('userAgencyName_isa', 'Your Awesome Realty'));
  
  const [twilioAccountSid, setTwilioAccountSid] = useState(() => getFromLocalStorage('twilioAccountSid_isa', ''));
  const [twilioAuthToken, setTwilioAuthToken] = useState(() => getFromLocalStorage('twilioAuthToken_isa', ''));
  const [twilioFromNumber, setTwilioFromNumber] = useState(() => getFromLocalStorage('twilioFromNumber_isa', ''));

  const [airtableApiKey, setAirtableApiKey] = useState(() => getFromLocalStorage('airtableApiKey_isa', ''));
  const [airtableBaseId, setAirtableBaseId] = useState(() => getFromLocalStorage('airtableBaseId_isa', ''));
  const [airtableLeadsTableName, setAirtableLeadsTableName] = useState(() => getFromLocalStorage('airtableLeadsTableName_isa', 'Leads'));
  const [airtableMessagesTableName, setAirtableMessagesTableName] = useState(() => getFromLocalStorage('airtableMessagesTableName_isa', 'Messages'));

  const [isSettingsOpen, setIsSettingsOpen] = useState(!fubApiKey || !geminiApiKey || !twilioAccountSid || !airtableApiKey); // Open if any key is missing
  const [isCopied, setIsCopied] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({ name: '', email: '', phone: '', notes: '' });

  useEffect(() => { setToLocalStorage('fubApiKey_isa', fubApiKey); }, [fubApiKey]);
  useEffect(() => { setToLocalStorage('geminiApiKey_isa', geminiApiKey); }, [geminiApiKey]);
  useEffect(() => { setToLocalStorage('userAgencyName_isa', userAgencyName); }, [userAgencyName]);
  useEffect(() => { setToLocalStorage('twilioAccountSid_isa', twilioAccountSid); }, [twilioAccountSid]);
  useEffect(() => { setToLocalStorage('twilioAuthToken_isa', twilioAuthToken); }, [twilioAuthToken]);
  useEffect(() => { setToLocalStorage('twilioFromNumber_isa', twilioFromNumber); }, [twilioFromNumber]);
  useEffect(() => { setToLocalStorage('airtableApiKey_isa', airtableApiKey); }, [airtableApiKey]);
  useEffect(() => { setToLocalStorage('airtableBaseId_isa', airtableBaseId); }, [airtableBaseId]);
  useEffect(() => { setToLocalStorage('airtableLeadsTableName_isa', airtableLeadsTableName); }, [airtableLeadsTableName]);
  useEffect(() => { setToLocalStorage('airtableMessagesTableName_isa', airtableMessagesTableName); }, [airtableMessagesTableName]);

  const callBackendAPI = async (endpoint, method = 'GET', body = null, actionName = "Backend Action") => {
    setIsPerformingBackendAction(true);
    setSystemMessage({ type: 'info', text: `Performing ${actionName}...` });
    let requestUrl = `${BACKEND_API_BASE_URL}${endpoint}`; // Define requestUrl here to be accessible in catch

    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (method === 'GET') {
        requestUrl += (requestUrl.includes('?') ? '&' : '?') + `_=${new Date().getTime()}`;
      }

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(requestUrl, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status} ${response.statusText}` }));
        throw new Error(`${actionName} failed (${response.status}): ${errorData.message || response.statusText || 'Unknown backend error'}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        return data;
      } else {
        if (response.status === 204) return { message: `${actionName} successful (No Content).` };
        return { message: `${actionName} successful (non-JSON response).` };
      }
    } catch (error) {
      console.error(`Error in ${actionName} (${requestUrl}):`, error); // Use requestUrl here
      setSystemMessage({ type: 'error', text: `${actionName} failed: ${error.message}` });
      throw error;
    } finally {
      setIsPerformingBackendAction(false);
    }
  };
  
  const fetchLeadsFromBackend = useCallback(async (showNotification = true) => {
    setIsLoadingLeads(true);
    try {
      const data = await callBackendAPI('/leads', 'GET', null, "Fetch Leads");
      if (data && data.leads) {
        setLeads(data.leads.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
        if (showNotification) setSystemMessage({ type: 'success', text: `${data.leads.length} leads fetched.` });
      } else {
        console.warn("Backend did not return data.leads. Data received:", data);
        setLeads(MOCK_LEADS_INITIAL.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
        if (showNotification) setSystemMessage({ type: 'info', text: 'Fetched mock leads (issue with backend data or error).' });
      }
    } catch (error) {
      if (showNotification) setSystemMessage({ type: 'error', text: `Workspace leads failed. Using initial mock data.` });
      setLeads(MOCK_LEADS_INITIAL.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
    } finally {
      setIsLoadingLeads(false);
    }
  }, []); 

  const handleCreateLeadViaBackend = async () => { 
    if (!newLeadData.name || !newLeadData.email) { setSystemMessage({ type: 'error', text: 'Lead name and email are required.' }); return; }
    try {
      const createdLead = await callBackendAPI('/leads', 'POST', newLeadData, "Create Lead");
      setSystemMessage({ type: 'success', text: `Lead "${createdLead.name || newLeadData.name}" creation initiated.` });
      fetchLeadsFromBackend(false); 
      setShowAddLeadModal(false);
      setNewLeadData({ name: '', email: '', phone: '', notes: '' });
    } catch (error) { /* Handled by callBackendAPI's setSystemMessage */ }
  };

  const handleDeleteLeadViaBackend = async (leadId, leadName) => { 
    if (!window.confirm(`Delete lead "${leadName}"? (This will call the backend)`)) return;
    try {
      await callBackendAPI(`/leads/${leadId}`, 'DELETE', null, "Delete Lead");
      setSystemMessage({ type: 'success', text: `Lead "${leadName}" deletion request sent.` });
      setSelectedLead(null);
      fetchLeadsFromBackend(false);
    } catch (error) { /* Handled by callBackendAPI's setSystemMessage */ }
  };

  const nurtureWithGemini = async (lead, currentConversation = []) => { 
    if (!geminiApiKey) { setSystemMessage({ type: 'error', text: 'Gemini API Key required.' }); return null; }
    if (!lead) { setSystemMessage({ type: 'error', text: 'No lead selected.' }); return null; }
    setIsLoadingGemini(true); setGeminiMessage('');
    setSystemMessage({ type: 'info', text: `Asking ${AI_SENDER_NAME} (Gemini) for ${lead.name}...` });
    let conversationHistoryText = "This is the beginning of the conversation.\n";
    if (currentConversation.length > 0) { conversationHistoryText = currentConversation.map(msg => `${msg.sender === AI_SENDER_NAME ? AI_SENDER_NAME : lead.name}: ${msg.text}`).join('\n') + '\n'; }
    const leadTagsString = lead.tags && lead.tags.length > 0 ? lead.tags.join(', ') : 'No specific tags';
    const prompt = `You are ${AI_SENDER_NAME}, an expert real estate ISA for "${userAgencyName}". Your goal: engage lead, collect qualifying info (buy/sell, timeline, area/property type, pre-approved?), determine if ready for human agent. Lead Details: Name: ${lead.name}, Email: ${lead.email||'N/A'}, Phone: ${lead.phone||'N/A'}, CRM Status: "${lead.status}", CRM Notes: "${lead.notes||'N/A'}", Source: ${lead.source||'N/A'}, Tags: ${leadTagsString}. Conversation History (you are ${AI_SENDER_NAME}): ${conversationHistoryText}${AI_SENDER_NAME}: (Your response here. Concise, like SMS. One clear question or CTA.) Instructions: Start: friendly greeting, open question based on details. History: respond to last Lead message. Gather needs. Natural, conversational. Strong interest/request to speak: suggest connecting to agent. Rude/not interested: politely end. Output only your next message as ${AI_SENDER_NAME}. No "${AI_SENDER_NAME}:" prefix.`;
    try {
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) { let eD=`HTTP ${response.status}`; try{const eDt=await response.json();eD=`Gemini Err (${response.status}): ${eDt.error?.message||JSON.stringify(eDt)}`}catch(e){eD=`Gemini Err (${response.status}): ${response.statusText||'Failed to parse'}`} throw new Error(eD); }
        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            const aiResponseText = result.candidates[0].content.parts[0].text.trim();
            setGeminiMessage(aiResponseText); 
            setSystemMessage({ type: 'success', text: `${AI_SENDER_NAME}'s suggestion received.` });
            return aiResponseText;
        } else { throw new Error('Unexpected API response from Gemini.'); }
    } catch (error) { console.error("Error calling Gemini API:", error); setGeminiMessage(`Error: ${error.message}.`); setSystemMessage({ type: 'error', text: `Gemini API call failed: ${error.message}` }); return null;
    } finally { setIsLoadingGemini(false); }
  };

  const addMessageToConversation = (leadId, sender, text) => { 
    const newMessage = { sender, text, timestamp: new Date().toISOString() };
    setLeads(prevLeads => prevLeads.map(l => l.id === leadId ? { ...l, conversationHistory: [...(l.conversationHistory || []), newMessage] } : l ));
    if (selectedLead && selectedLead.id === leadId) { setSelectedLead(prevSelectedLead => prevSelectedLead ? { ...prevSelectedLead, conversationHistory: [...(prevSelectedLead.conversationHistory || []), newMessage] } : null ); }
  };

  const handleSendEugeniaMessageViaBackend = async (lead, messageText) => { 
    if (!lead || !messageText) { setSystemMessage({type: 'error', text: 'Lead or message text missing.'}); return; }
    setIsSending(true);
    try {
      await callBackendAPI('/send-ai-message', 'POST', { 
        leadId: lead.id, 
        message: messageText, 
        senderName: AI_SENDER_NAME, 
        leadPhoneNumber: lead.phone 
      }, "Send AI Message");
      
      addMessageToConversation(lead.id, AI_SENDER_NAME, messageText); 
      const newLastContacted = new Date().toISOString(); const newStatus = "AI Nurturing"; 
      setLeads(prevLeads => prevLeads.map(l => l.id === lead.id ? {...l, status: newStatus, lastContacted: newLastContacted} : l));
      if (selectedLead && selectedLead.id === lead.id) { setSelectedLead(prev => ({...prev, status: newStatus, lastContacted: newLastContacted})); }
      setSystemMessage({type: 'success', text: `${AI_SENDER_NAME}'s message sent request to backend.`}); 
      setGeminiMessage(''); 
    } catch (error) { /* Handled by callBackendAPI */ } 
    finally { setIsSending(false); }
  };
  
  const handleLeadReplySubmitViaBackend = async () => { 
    if (!selectedLead || !leadReply.trim()) { setSystemMessage({type: 'error', text: 'Select lead & enter reply.'}); return; }
    setIsSending(true); 
    const replyText = leadReply.trim();
    try {
      addMessageToConversation(selectedLead.id, selectedLead.name, replyText); 
      const currentHistory = leads.find(l => l.id === selectedLead.id)?.conversationHistory || []; 
      setLeadReply(''); 
      const backendResponse = await callBackendAPI('/log-incoming-message', 'POST', { 
          leadId: selectedLead.id, 
          leadName: selectedLead.name, 
          message: replyText, 
          currentConversation: currentHistory,
          leadPhoneNumber: selectedLead.phone 
        }, "Log Lead Reply & Get AI Response");

      if (backendResponse && backendResponse.eugeniaReply) {
        setGeminiMessage(backendResponse.eugeniaReply); 
        setSystemMessage({type: 'info', text: `${AI_SENDER_NAME}'s response drafted. Review and send.`});
      } else {
        const updatedHistoryAfterLeadReply = leads.find(l => l.id === selectedLead.id)?.conversationHistory || [];
        await nurtureWithGemini(selectedLead, updatedHistoryAfterLeadReply);
      }
    } catch (error) { /* Handled by callBackendAPI */ } 
    finally { setIsSending(false); }
  };
  
  const processNewLeadsViaBackend = async () => { 
    if (!fubApiKey || !geminiApiKey || !twilioAccountSid) { setSystemMessage({type: 'error', text: 'FUB, Gemini, and Twilio (via backend) configurations are needed.'}); return; }
    setIsProcessingNewLeads(true);
    try {
      await callBackendAPI('/initiate-ai-outreach', 'POST', null, "Process New Leads");
      setSystemMessage({type: 'success', text: 'New lead processing initiated via backend.'}); 
      fetchLeadsFromBackend(false); 
    } catch (error) { /* Handled by callBackendAPI */ } 
    finally { setIsProcessingNewLeads(false); }
  };

  useEffect(() => { fetchLeadsFromBackend(); }, [fetchLeadsFromBackend]);

  const handleSelectLead = (lead) => { 
    const leadWithInitializedHistory = { ...lead, conversationHistory: lead.conversationHistory || [] };
    setSelectedLead(leadWithInitializedHistory); 
    setGeminiMessage(''); 
    setLeadReply('');
    const lastMessage = leadWithInitializedHistory.conversationHistory.length > 0 ? leadWithInitializedHistory.conversationHistory[leadWithInitializedHistory.conversationHistory.length - 1] : null;
    if (geminiApiKey && ((lastMessage && lastMessage.sender !== AI_SENDER_NAME) || leadWithInitializedHistory.conversationHistory.length === 0)) { 
        nurtureWithGemini(leadWithInitializedHistory, leadWithInitializedHistory.conversationHistory); 
    } else if (!geminiApiKey) { 
        setSystemMessage({type: 'info', text: 'Enter Gemini API Key for suggestions.'}); 
    }
  };

  const handleNewLeadInputChange = (e) => { const { name, value } = e.target; setNewLeadData(prev => ({ ...prev, [name]: value })); };
  const copyToClipboard = (text) => { if (!text) return; const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');setIsCopied(true);setSystemMessage({type:'success',text:'Copied!'});setTimeout(()=>setIsCopied(false),1500)}catch(err){setSystemMessage({type:'error',text:'Copy failed.'})}document.body.removeChild(ta)};

  // --- JSX UI ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 font-sans flex flex-col">
      <header className="bg-slate-800/70 backdrop-blur-lg shadow-xl p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold text-sky-400 flex items-center"> <Brain size={32} className="mr-3 text-green-400" /> FUB {AI_SENDER_NAME} ISA </h1>
          <div className="flex items-center gap-2">
            <button onClick={processNewLeadsViaBackend} disabled={isProcessingNewLeads || isLoadingLeads || isPerformingBackendAction || !fubApiKey } className="p-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 flex items-center text-sm" title="Process New Leads for AI Engagement (via Backend)"> {isProcessingNewLeads || (isLoadingLeads && isPerformingBackendAction) ? <RefreshCw size={18} className="animate-spin mr-2"/> : <UserCheck size={18} className="mr-2"/>} Engage New </button>
            <button onClick={() => setShowAddLeadModal(true)} disabled={isPerformingBackendAction} className="p-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400" title="Add New Lead"> <PlusCircle size={22} /> </button>
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 rounded-lg hover:bg-sky-600/70 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400" aria-label="Toggle Settings"> <Settings size={24} /> </button>
          </div>
        </div>
      </header>

      {systemMessage.text && (  
        <div className={`fixed top-20 right-5 p-3 rounded-lg shadow-xl z-[100] max-w-md text-sm ${systemMessage.type === 'error' ? 'bg-red-600/95' : systemMessage.type === 'success' ? 'bg-green-600/95' : (systemMessage.type === 'warning' ? 'bg-yellow-500/95 text-slate-900' : 'bg-sky-600/95')} ${systemMessage.type !== 'warning' ? 'text-white' : ''} transition-all duration-300 ease-in-out flex items-start`}>
          <div className="flex-shrink-0 mr-2 mt-0.5"> {systemMessage.type === 'error' && <AlertTriangle size={18} />} {systemMessage.type === 'success' && <Check size={18} />} {(systemMessage.type === 'info' || systemMessage.type === 'warning') && <MessageCircle size={18} />} </div>
          <p className="flex-grow">{systemMessage.text}</p>
          <button onClick={() => setSystemMessage({type: '', text: ''})} className={`ml-2 ${systemMessage.type !=='warning' ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} text-lg leading-none`}>&times;</button>
        </div>
      )}

      {isSettingsOpen && ( 
        <div className="bg-slate-800 p-4 shadow-md mb-2 transition-all duration-300 ease-in-out">
          <div className="container mx-auto">
            <h2 className="text-xl font-semibold text-sky-300 mb-3">Settings (AI Persona: {AI_SENDER_NAME})</h2>
            <p className="text-xs text-slate-400 mb-3">Configure API keys/IDs for backend use. Gemini key can be client-side or backend.</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 mb-3">
              <div> <label htmlFor="fubApiKey" className="block text-sm font-medium text-slate-300 mb-1">FUB API Key (Backend):</label> <input type="password" id="fubApiKey" value={fubApiKey} onChange={(e) => setFubApiKey(e.target.value)} placeholder="FUB Key" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="geminiApiKey" className="block text-sm font-medium text-slate-300 mb-1">Gemini API Key:</label> <input type="password" id="geminiApiKey" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="Gemini Key" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> <p className="text-xs text-slate-400 mt-1">From <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Google AI Studio</a>.</p> </div>
              <div> <label htmlFor="userAgencyName" className="block text-sm font-medium text-slate-300 mb-1">Your Agency Name:</label> <input type="text" id="userAgencyName" value={userAgencyName} onChange={(e) => setUserAgencyName(e.target.value)} placeholder="Agency Name" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="twilioAccountSid" className="block text-sm font-medium text-slate-300 mb-1">Twilio SID (Backend):</label> <input type="password" id="twilioAccountSid" value={twilioAccountSid} onChange={(e) => setTwilioAccountSid(e.target.value)} placeholder="Twilio SID" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="twilioAuthToken" className="block text-sm font-medium text-slate-300 mb-1">Twilio Token (Backend):</label> <input type="password" id="twilioAuthToken" value={twilioAuthToken} onChange={(e) => setTwilioAuthToken(e.target.value)} placeholder="Twilio Token" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="twilioFromNumber" className="block text-sm font-medium text-slate-300 mb-1">Twilio From # (Backend):</label> <input type="text" id="twilioFromNumber" value={twilioFromNumber} onChange={(e) => setTwilioFromNumber(e.target.value)} placeholder="+1..." className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="airtableApiKey" className="block text-sm font-medium text-slate-300 mb-1">Airtable API Key (Backend):</label> <input type="password" id="airtableApiKey" value={airtableApiKey} onChange={(e) => setAirtableApiKey(e.target.value)} placeholder="Airtable Key" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="airtableBaseId" className="block text-sm font-medium text-slate-300 mb-1">Airtable Base ID (Backend):</label> <input type="text" id="airtableBaseId" value={airtableBaseId} onChange={(e) => setAirtableBaseId(e.target.value)} placeholder="appXXXXXXXXXXXXXX" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="airtableLeadsTableName" className="block text-sm font-medium text-slate-300 mb-1">Airtable Leads Table (Backend):</label> <input type="text" id="airtableLeadsTableName" value={airtableLeadsTableName} onChange={(e) => setAirtableLeadsTableName(e.target.value)} placeholder="e.g., Leads" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
              <div> <label htmlFor="airtableMessagesTableName" className="block text-sm font-medium text-slate-300 mb-1">Airtable Messages Table (Backend):</label> <input type="text" id="airtableMessagesTableName" value={airtableMessagesTableName} onChange={(e) => setAirtableMessagesTableName(e.target.value)} placeholder="e.g., Messages" className="w-full p-2 rounded-md bg-slate-700 border-slate-600"/> </div>
            </div>
            <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-md text-yellow-200 text-xs"> <AlertTriangle size={16} className="inline mr-2 mb-0.5" /> <strong>Important:</strong> This UI simulates interaction with a backend. API keys for FUB/Twilio/Airtable must be secured on your actual backend server. </div>
          </div>
        </div>
      )}
      
      {showAddLeadModal && ( 
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-semibold text-sky-300 mb-4">Add New Lead (via Backend)</h3>
            <div className="space-y-3">
              <div><label htmlFor="newLeadName" className="text-sm text-slate-300">Full Name:</label><input type="text" id="newLeadName" name="name" value={newLeadData.name} onChange={handleNewLeadInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
              <div><label htmlFor="newLeadEmail" className="text-sm text-slate-300">Email:</label><input type="email" id="newLeadEmail" name="email" value={newLeadData.email} onChange={handleNewLeadInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
              <div><label htmlFor="newLeadPhone" className="text-sm text-slate-300">Phone (E.164):</label><input type="tel" id="newLeadPhone" name="phone" value={newLeadData.phone} onChange={handleNewLeadInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
              <div><label htmlFor="newLeadNotes" className="text-sm text-slate-300">Notes:</label><textarea id="newLeadNotes" name="notes" value={newLeadData.notes} onChange={handleNewLeadInputChange} rows="3" className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600 resize-none"></textarea></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowAddLeadModal(false)} disabled={isPerformingBackendAction} className="px-4 py-2 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
              <button onClick={handleCreateLeadViaBackend} disabled={isPerformingBackendAction || !newLeadData.name || !newLeadData.email} className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-600 flex items-center"> {isPerformingBackendAction && <RefreshCw size={18} className="animate-spin mr-2"/>} Create Lead </button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto p-4 flex-grow flex flex-col md:flex-row gap-6">
        <div className="md:w-1/3 bg-slate-800/70 p-5 rounded-xl shadow-2xl flex flex-col max-h-[calc(100vh-220px)] md:max-h-[calc(100vh-180px)]">
          <div className="flex justify-between items-center mb-4"> <h2 className="text-2xl font-semibold text-sky-300">Leads</h2> <button onClick={() => fetchLeadsFromBackend(true)} disabled={isLoadingLeads || isPerformingBackendAction} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white rounded-lg shadow-md flex items-center"> {isLoadingLeads ? <RefreshCw size={18} className="animate-spin mr-2"/> : "Fetch Leads"} </button> </div>
          {isLoadingLeads && <p className="text-center text-slate-400 py-4">Loading leads...</p>}
          {!isLoadingLeads && !leads.length && <p className="text-center text-slate-400 py-4">No leads. Click "Fetch Leads" or add one.</p>}
          <div className="overflow-y-auto space-y-3 pr-2 flex-grow"> {leads.map(lead => ( <LeadItem key={lead.id} lead={lead} onSelectLead={handleSelectLead} selectedLeadId={selectedLead?.id} onDeleteLead={handleDeleteLeadViaBackend} isBackendActionInProgress={isPerformingBackendAction} /> ))} </div>
        </div>
        
        <div className="md:w-2/3 bg-slate-800/70 p-6 rounded-xl shadow-2xl flex flex-col max-h-[calc(100vh-220px)] md:max-h-[calc(100vh-180px)]">
          {selectedLead ? (
            <>
              <SelectedLeadDetails lead={selectedLead} onDeleteLead={handleDeleteLeadViaBackend} isBackendActionInProgress={isPerformingBackendAction} />
              <div className="mt-4 border-t border-slate-700 pt-4 flex-grow flex flex-col overflow-hidden">
                <h3 className="text-lg font-semibold text-sky-300 mb-2">Conversation with {selectedLead.name}</h3>
                <div className="flex-grow overflow-y-auto space-y-3 pr-2 mb-3 bg-slate-700/30 p-3 rounded-md min-h-[150px]">
                  {(selectedLead.conversationHistory && selectedLead.conversationHistory.length > 0) ? selectedLead.conversationHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === AI_SENDER_NAME ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] p-2.5 rounded-xl shadow ${msg.sender === AI_SENDER_NAME ? 'bg-sky-600 text-white rounded-br-none' : 'bg-slate-600 text-slate-100 rounded-bl-none'}`}>
                        <p className="text-xs font-semibold mb-0.5">{msg.sender === AI_SENDER_NAME ? AI_SENDER_NAME : selectedLead.name}</p>
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        <p className="text-xs mt-1 opacity-70 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  )) : <p className="text-slate-400 text-center py-4">No conversation history yet. Click "Ask {AI_SENDER_NAME}" or log a reply.</p>}
                </div>
                <div className="mt-2 border-t border-slate-700 pt-3">
                  <label htmlFor="leadReply" className="block text-sm font-medium text-slate-300 mb-1">Log Lead's Reply (Simulates SMS Inbound):</label>
                  <textarea id="leadReply" value={leadReply} onChange={(e) => setLeadReply(e.target.value)} placeholder={`Enter ${selectedLead.name}'s reply here...`} rows="3" className="w-full p-2 rounded-md bg-slate-700 border-slate-600 focus:ring-2 focus:ring-sky-500 outline-none" disabled={isSending || isLoadingGemini || isPerformingBackendAction}/>
                  <button onClick={handleLeadReplySubmitViaBackend} disabled={!leadReply.trim() || isSending || isLoadingGemini || isPerformingBackendAction} className="mt-2 w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 rounded-lg shadow-md flex items-center justify-center disabled:bg-slate-600 disabled:text-slate-400"> Log Reply & Get {AI_SENDER_NAME}'s Next </button>
                </div>
                <div className="mt-4 border-t border-slate-700 pt-3">
                    <h3 className="text-md font-semibold text-sky-300 mb-1 flex items-center"> <Bot size={20} className="mr-2 text-green-400" /> {AI_SENDER_NAME}'s Next Message Draft: </h3>
                    {isLoadingGemini && ( <div className="flex items-center justify-center h-20 bg-slate-700/50 rounded-lg"> <RefreshCw size={24} className="animate-spin text-sky-400"/> <p className="ml-3 text-slate-300">Thinking...</p> </div> )}
                    {!isLoadingGemini && ( <textarea value={geminiMessage} onChange={(e) => setGeminiMessage(e.target.value)} placeholder={geminiApiKey ? "Draft will appear here..." : "Enter Gemini API Key..."} rows="4" className="w-full p-2 rounded-md bg-slate-700 border-slate-600 focus:ring-2 focus:ring-sky-500 outline-none" disabled={!geminiApiKey || isSending || isPerformingBackendAction}/> )}
                    <div className="mt-2 flex gap-2">
                        <button onClick={() => nurtureWithGemini(selectedLead, selectedLead.conversationHistory || [])} disabled={isLoadingGemini || !geminiApiKey || !selectedLead || isSending || isPerformingBackendAction} className="flex-1 px-3 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white rounded-lg shadow-md flex items-center justify-center"> <Bot size={16} className="mr-1.5" /> Regenerate </button>
                        <button onClick={() => handleSendEugeniaMessageViaBackend(selectedLead, geminiMessage)} disabled={!geminiMessage.trim() || isLoadingGemini || !selectedLead || isSending || isPerformingBackendAction || (!twilioAccountSid && selectedLead?.phone) } className="flex-1 px-3 py-2 text-sm bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white rounded-lg shadow-md flex items-center justify-center"> {isSending || (isPerformingBackendAction && isLoadingGemini) ? <RefreshCw size={16} className="animate-spin mr-1.5"/> : <Send size={16} className="mr-1.5" />} Send {AI_SENDER_NAME}'s Msg </button>
                        <button onClick={() => copyToClipboard(geminiMessage)} disabled={!geminiMessage.trim() || isSending || isPerformingBackendAction} title="Copy message" className="p-2.5 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white rounded-lg shadow-md flex items-center justify-center"> {isCopied ? <Check size={16} /> : <Copy size={16} />} </button>
                    </div>
                </div>
              </div>
            </>
          ) : ( 
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center"> <User size={48} className="mb-4 text-slate-500" /> <p className="text-xl">Select a lead from the list to view details and nurture.</p> {!fubApiKey && <p className="mt-2 text-yellow-400">Enter FUB API Key for backend use.</p>} {fubApiKey && !geminiApiKey && <p className="mt-2 text-yellow-400">Enter Gemini API Key for AI suggestions.</p>} </div>
          )}
        </div>
      </main>
      <footer className="text-center p-4 text-sm text-slate-500 border-t border-slate-700/50 mt-auto"> FUB {AI_SENDER_NAME} ISA v0.7.1 - Airtable Backup Conceptualized. </footer>
    </div>
  );
};

const LeadItem = ({ lead, onSelectLead, selectedLeadId, onDeleteLead, isBackendActionInProgress }) => { 
  const [isExpanded, setIsExpanded] = useState(false); const isSelected = lead.id === selectedLeadId;
  return (
    <div className={`p-3 rounded-lg shadow-md cursor-pointer transition-all duration-200 ease-in-out ${isSelected ? 'bg-sky-700 ring-2 ring-sky-400 shadow-sky-500/30' : 'bg-slate-700 hover:bg-slate-600/70'}`} onClick={() => onSelectLead(lead)}>
      <div className="flex justify-between items-center">
        <div> <h3 className={`text-md font-semibold ${isSelected ? 'text-white' : 'text-sky-300'}`}>{lead.name}</h3> <p className={`text-xs ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>{lead.email || 'No email'}</p> <p className={`text-xs mt-0.5 ${isSelected ? 'text-sky-200' : 'text-slate-300'}`}>Status: <span className="font-medium">{lead.status}</span></p> </div>
        <div className="flex items-center gap-1"> {isSelected && <button onClick={(e) => { e.stopPropagation(); onDeleteLead(lead.id, lead.name); }} disabled={isBackendActionInProgress} className={`p-1.5 rounded hover:bg-red-500/70 disabled:opacity-50 ${isSelected ? 'text-red-300 hover:text-white' : 'text-red-400'}`} title="Delete Lead"><Trash2 size={16}/></button>} <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className={`p-1 rounded hover:bg-slate-500/30 ${isSelected ? 'text-sky-100' : 'text-slate-300'}`} aria-label={isExpanded ? "Collapse" : "Expand"}> {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />} </button> </div>
      </div>
      {isExpanded && ( <div className="mt-2 pt-2 border-t border-slate-600/50 text-xs space-y-1"> {lead.phone && <p className={`${isSelected ? 'text-sky-100' : 'text-slate-300'}`}><strong>Phone:</strong> {lead.phone}</p>} {lead.source && <p className={`${isSelected ? 'text-sky-100' : 'text-slate-300'}`}><strong>Source:</strong> {lead.source}</p>} {lead.lastContacted && <p className={`${isSelected ? 'text-sky-100' : 'text-slate-300'}`}><strong>Last Contact:</strong> {new Date(lead.lastContacted).toLocaleDateString()}</p>} {lead.tags && lead.tags.length > 0 && ( <div className="flex flex-wrap gap-1 mt-1"> {lead.tags.slice(0, 5).map(tag => ( <span key={tag} className={`px-1.5 py-0.5 rounded-full text-xs ${isSelected ? 'bg-sky-500 text-white' : 'bg-slate-600 text-slate-200'}`}>{tag}</span> ))} </div> )} {lead.notes && <p className={`mt-1 italic ${isSelected ? 'text-sky-200' : 'text-slate-400'}`}>Notes: {lead.notes.substring(0,70)}${lead.notes.length > 70 ? '...' : ''}</p>} <a href={lead.fubLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`mt-1 inline-flex items-center ${isSelected ? 'text-sky-300 hover:text-sky-100' : 'text-sky-400 hover:text-sky-300'}`}> View in FUB <ExternalLink size={12} className="ml-1" /> </a> </div> )}
    </div>
  );
};
const SelectedLeadDetails = ({ lead, onDeleteLead, isBackendActionInProgress }) => { 
  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        <div> <h2 className="text-2xl lg:text-3xl font-bold text-sky-300">{lead.name}</h2> <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-1 text-slate-300 text-sm"> {lead.email && <span className="flex items-center"><Mail size={14} className="mr-1.5 text-sky-400" /> {lead.email}</span>} {lead.phone && <span className="flex items-center mt-1 sm:mt-0"><Phone size={14} className="mr-1.5 text-sky-400" /> {lead.phone}</span>} </div> </div>
        <div className="flex gap-2 items-center self-start sm:self-center mt-2 sm:mt-0"> <a href={lead.fubLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-sky-300 text-xs sm:text-sm rounded-md shadow flex items-center"> Open in FUB <ExternalLink size={14} className="ml-1.5" /> </a> <button onClick={() => onDeleteLead(lead.id, lead.name)} disabled={isBackendActionInProgress} className="p-2 rounded-md bg-red-700 hover:bg-red-600 disabled:bg-slate-600 text-white" title="Delete Lead from FUB"><Trash2 size={16}/></button> </div>
      </div>
      <div className="mt-3 space-y-1 text-sm"> <p><strong className="text-slate-400">Status:</strong> <span className="px-2 py-0.5 bg-sky-500 text-white rounded-full text-xs font-medium">{lead.status}</span></p> {lead.source && <p><strong className="text-slate-400">Source:</strong> <span className="text-slate-200">{lead.source}</span></p>} {lead.lastContacted && <p><strong className="text-slate-400">Last Contacted:</strong> <span className="text-slate-200">{new Date(lead.lastContacted).toLocaleString()}</span></p>} {lead.tags && lead.tags.length > 0 && ( <div className="mt-1"> <strong className="text-slate-400">Tags:</strong> <div className="flex flex-wrap gap-1.5 mt-0.5"> {lead.tags.map(tag => ( <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-slate-600 text-slate-200 flex items-center"> <Tag size={10} className="mr-1 opacity-70"/>{tag} </span> ))} </div> </div> )} {lead.notes && <p className="mt-2"><strong className="text-slate-400">Notes:</strong> <span className="italic text-slate-300 whitespace-pre-wrap">{lead.notes}</span></p>} </div>
    </div>
  );
};

export default App;