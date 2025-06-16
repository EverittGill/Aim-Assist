// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, Check, MessageCircle, RefreshCw, PlusCircle, UserCheck 
} from 'lucide-react';

// Services
import {
  fetchLeads, createLead, deleteLead, sendEugeniaMessage,
  logIncomingLeadReplyAndGetNext, initiateNewLeadProcessing,
  generateInitialMessage, generateAIReply, updateLeadStatus
} from './services/apiService';

// Utilities
import { getFromLocalStorage, setToLocalStorage } from './utils/localStorage';
import { copyToClipboardUtil } from './utils/clipboard';

// Components
import NavBar from './components/NavBar';
import SettingsPanel from './components/SettingsPanel';
import AddLeadModal from './components/AddLeadModal';
import LeadManagementView from './components/LeadManagementView';
import AuthWrapper from './components/AuthWrapper';

// Constants
import { AI_SENDER_NAME, MOCK_LEADS_INITIAL } from './components/constants';

const App = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const { leadId } = useParams();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [geminiMessage, setGeminiMessage] = useState(''); 
  const [leadReply, setLeadReply] = useState(''); 
  
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [isLoadingGemini, setIsLoadingGemini] = useState(false);
  const [isSending, setIsSending] = useState(false); 
  const [isProcessingNewLeads, setIsProcessingNewLeads] = useState(false);
  
  const [systemMessage, setSystemMessage] = useState({ type: '', text: '' });

  // --- State for SettingsPanel (Simplified) ---
  const [userAgencyName, setUserAgencyName] = useState(() => getFromLocalStorage('userAgencyName_isa', 'Your Awesome Realty'));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({ name: '', email: '', phone: '', notes: '' });

  // Persist relevant settings to localStorage
  useEffect(() => { setToLocalStorage('userAgencyName_isa', userAgencyName); }, [userAgencyName]);

  const handleSystemMessage = (type, text) => { setSystemMessage({ type, text }); };

  const handleNurtureWithGemini = useCallback(async (lead, currentConversation = []) => {
    setIsLoadingGemini(true); setGeminiMessage('');
    handleSystemMessage('info', `Asking ${AI_SENDER_NAME} for ${lead.name}...`);
    try {
      let aiResponse;
      if (currentConversation.length === 0) {
        // Generate initial message
        const result = await generateInitialMessage({
          id: lead.id,
          name: lead.name,
          source: lead.source,
          notes: lead.notes
        }, userAgencyName);
        aiResponse = result.message;
      } else {
        // Generate reply based on conversation
        const result = await generateAIReply({
          id: lead.id,
          name: lead.name,
          source: lead.source,
          notes: lead.notes
        }, currentConversation, userAgencyName);
        aiResponse = result.message;
      }
      setGeminiMessage(aiResponse);
      handleSystemMessage('success', `${AI_SENDER_NAME}'s suggestion received.`);
    } catch (error) {
      setGeminiMessage(`Error: ${error.message}.`); 
      handleSystemMessage('error', error.message || `Failed to generate AI message.`);
    } finally { setIsLoadingGemini(false); }
  }, [userAgencyName]);

  // Handle URL-based lead selection
  useEffect(() => {
    if (leadId && leads.length > 0) {
      const lead = leads.find(l => l.id === leadId);
      if (lead && (!selectedLead || selectedLead.id !== leadId)) {
        setSelectedLead(lead);
        setGeminiMessage('');
        setLeadReply('');
        if (lead.conversationHistory && lead.conversationHistory.length === 0) {
          handleNurtureWithGemini(lead, []);
        }
      } else if (!lead) {
        // Lead not found, navigate to home
        navigate('/');
      }
    }
  }, [leadId, leads, selectedLead, handleNurtureWithGemini, navigate]);
  
  const loadLeads = useCallback(async (showNotification = true) => {
    setIsLoadingLeads(true);
    if (showNotification) handleSystemMessage('info', 'Fetching leads...');
    try {
      const data = await fetchLeads();
      if (data && data.leads) {
        setLeads(data.leads.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
        if (showNotification) handleSystemMessage('success', `${data.leads.length} leads fetched.`);
      } else {
        console.warn("Backend did not return data.leads. Data received:", data);
        setLeads(MOCK_LEADS_INITIAL.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
        if (showNotification) handleSystemMessage('info', 'Fetched mock leads (issue with backend data or error).');
      }
    } catch (error) {
      if (showNotification) handleSystemMessage('error', error.message || 'Fetch leads failed. Using mock data. Check backend configuration & logs.');
      setLeads(MOCK_LEADS_INITIAL.map(l => ({ ...l, conversationHistory: l.conversationHistory || [] })));
    } finally {
      setIsLoadingLeads(false);
    }
  }, []); 

  const handleCreateLead = async () => { 
    if (!newLeadData.name || !newLeadData.email) { handleSystemMessage('error', 'Lead name and email are required.'); return; }
    setIsSending(true); handleSystemMessage('info', 'Creating lead...');
    try {
      await createLead(newLeadData);
      handleSystemMessage('success', 'Lead created successfully! Refreshing list...');
      setShowAddLeadModal(false); setNewLeadData({ name: '', email: '', phone: '', notes: '' });
      loadLeads(false);
    } catch (error) { handleSystemMessage('error', error.message || 'Failed to create lead.'); }
    finally { setIsSending(false); }
  };

  const handleDeleteLead = async (leadId, leadName) => {
    if (!window.confirm(`Are you sure you want to delete ${leadName}?`)) return;
    setIsSending(true); handleSystemMessage('info', `Deleting ${leadName}...`);
    try {
      await deleteLead(leadId);
      handleSystemMessage('success', `${leadName} deleted.`);
      if (selectedLead && selectedLead.id === leadId) setSelectedLead(null);
      loadLeads(false);
    } catch (error) { handleSystemMessage('error', error.message || 'Failed to delete lead.'); }
    finally { setIsSending(false); }
  };

  const addMessageToConversation = (leadId, sender, text) => { 
    const newMessage = { sender, text, timestamp: new Date().toISOString() };
    setLeads(prevLeads => prevLeads.map(l => l.id === leadId ? { ...l, conversationHistory: [...(l.conversationHistory || []), newMessage] } : l ));
    if (selectedLead && selectedLead.id === leadId) { setSelectedLead(prevSelectedLead => prevSelectedLead ? { ...prevSelectedLead, conversationHistory: [...(prevSelectedLead.conversationHistory || []), newMessage] } : null ); }
  };

  const handleSendEugeniaMessage = async (lead, messageText) => { 
    if (!lead || !messageText) { handleSystemMessage('error', 'Lead or message text missing.'); return; }
    setIsSending(true);
    handleSystemMessage('info', `Sending ${AI_SENDER_NAME}'s message...`);
    try {
      await sendEugeniaMessage({ 
        leadId: lead.id, message: messageText, senderName: AI_SENDER_NAME, leadPhoneNumber: lead.phone 
      });
      addMessageToConversation(lead.id, AI_SENDER_NAME, messageText); 
      const newLastContacted = new Date().toISOString(); const newStatus = "AI Nurturing"; 
      setLeads(prevLeads => prevLeads.map(l => l.id === lead.id ? {...l, status: newStatus, lastContacted: newLastContacted} : l));
      if (selectedLead && selectedLead.id === lead.id) { setSelectedLead(prev => ({...prev, status: newStatus, lastContacted: newLastContacted})); }
      handleSystemMessage('success', `${AI_SENDER_NAME}'s message sent request to backend.`); 
      setGeminiMessage(''); 
    } catch (error) { handleSystemMessage('error', error.message || `Failed to send ${AI_SENDER_NAME}'s message.`); } 
    finally { setIsSending(false); }
  };
  
  const handleLeadReplySubmit = async () => { 
    if (!selectedLead || !leadReply.trim()) { handleSystemMessage('error', 'Select lead & enter reply.'); return; }
    setIsSending(true); 
    const replyText = leadReply.trim();
    handleSystemMessage('info', "Processing lead's reply...");
    try {
      addMessageToConversation(selectedLead.id, selectedLead.name, replyText); 
      const currentHistory = leads.find(l => l.id === selectedLead.id)?.conversationHistory || []; 
      const updatedHistory = [...currentHistory, { sender: selectedLead.name, text: replyText, timestamp: new Date().toISOString() }];
      const response = await logIncomingLeadReplyAndGetNext({ 
        leadId: selectedLead.id, leadName: selectedLead.name, message: replyText, 
        currentConversation: updatedHistory, leadPhoneNumber: selectedLead.phone 
      });
      if (response && response.aiMessage) {
        setGeminiMessage(response.aiMessage);
        // Also add the AI response to conversation history
        addMessageToConversation(selectedLead.id, AI_SENDER_NAME, response.aiMessage);
        handleSystemMessage('success', `Lead reply logged. ${AI_SENDER_NAME} generated next message.`);
      } else { handleSystemMessage('info', 'Lead reply logged, but no AI response generated.'); }
      setLeadReply(''); 
    } catch (error) { handleSystemMessage('error', error.message || 'Failed to process lead reply.'); } 
    finally { setIsSending(false); }
  };

  const processNewLeads = async () => { 
    setIsProcessingNewLeads(true); handleSystemMessage('info', 'Processing new leads for AI engagement...');
    try {
      const response = await initiateNewLeadProcessing();
      handleSystemMessage('success', response.message || 'New lead processing initiated.');
      loadLeads(false);
    } catch (error) { handleSystemMessage('error', error.message || 'Failed to process new leads.'); } 
    finally { setIsProcessingNewLeads(false); }
  };

  const handleNewLeadInputChange = (field, value) => { setNewLeadData(prev => ({ ...prev, [field]: value })); };
  
  const handleSelectLead = useCallback((lead) => { 
    setSelectedLead(lead); setGeminiMessage(''); setLeadReply('');
    if (lead.conversationHistory && lead.conversationHistory.length === 0) { handleNurtureWithGemini(lead, []); }
    // Update URL to reflect selected lead
    navigate(`/conversation/${lead.id}`);
  }, [navigate, handleNurtureWithGemini]);

  const copyLeadMessageToClipboard = async (text) => { 
    try {
      await copyToClipboardUtil(text);
      setIsCopied(true); setTimeout(() => setIsCopied(false), 2000);
    } catch (error) { handleSystemMessage('error', 'Failed to copy to clipboard.'); }
  };

  const handleToggleAIPause = async (leadId, shouldPause) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    setIsSending(true);
    const action = shouldPause ? 'Pausing' : 'Resuming';
    handleSystemMessage('info', `${action} AI engagement for ${lead.name}...`);
    
    try {
      // Update lead status in FUB via backend API
      const newStatus = shouldPause ? 'AI - Paused' : 'AI - Active';
      await updateLeadStatus(leadId, newStatus);
      
      // Update lead status locally after successful backend call
      const updatedLeads = leads.map(l => 
        l.id === leadId ? { ...l, status: newStatus, aiStatus: shouldPause ? 'paused' : 'active' } : l
      );
      setLeads(updatedLeads);
      
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead(prev => ({ ...prev, status: newStatus, aiStatus: shouldPause ? 'paused' : 'active' }));
      }
      
      handleSystemMessage('success', `AI engagement ${shouldPause ? 'paused' : 'resumed'} for ${lead.name}`);
    } catch (error) {
      handleSystemMessage('error', error.message || 'Failed to update AI status');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => { loadLeads(false); }, [loadLeads]);

  const isAnyActionInProgress = isLoadingLeads || isLoadingGemini || isSending || isProcessingNewLeads;

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 text-warm-900 font-sans flex flex-col" data-theme="eugenia">
      <NavBar 
        onToggleSettings={() => setIsSettingsOpen(prev => !prev)} 
        user={user}
        onLogout={onLogout}
      />
      
      <header className="bg-warm-100/80 backdrop-blur-lg shadow-warm-md border-b border-warm-200 p-4 sticky top-[61px] z-50">
        <div className="container mx-auto flex justify-between items-center">
          <h2 className="text-xl font-semibold text-brand-800">Lead Engagement Panel</h2>
          <div className="flex items-center gap-2">
            <button onClick={processNewLeads} disabled={isAnyActionInProgress} className="btn btn-sm btn-primary flex items-center" title="Process New Leads for AI Engagement (via Backend)"> 
              {isProcessingNewLeads ? <RefreshCw size={16} className="animate-spin mr-1"/> : <UserCheck size={16} className="mr-1"/>} Engage New 
            </button>
            <button onClick={() => setShowAddLeadModal(true)} disabled={isAnyActionInProgress} className="btn btn-sm btn-accent flex items-center" title="Add New Lead"> 
              <PlusCircle size={16} className="mr-1" /> Add Lead 
            </button>
          </div>
        </div>
      </header>

      {systemMessage.text && (  
        <div className={`fixed top-36 right-5 p-4 rounded-lg shadow-warm-lg border border-warm-200 z-[100] max-w-md text-sm ${systemMessage.type === 'error' ? 'bg-error-light text-error-dark border-error' : systemMessage.type === 'success' ? 'bg-success-light text-success-dark border-success' : (systemMessage.type === 'warning' ? 'bg-warning-light text-warning-dark border-warning' : 'bg-info-light text-info-dark border-info')} transition-all duration-warm ease-warm flex items-start`}>
          <div className="flex-shrink-0 mr-3 mt-0.5"> 
            {systemMessage.type === 'error' && <AlertTriangle size={18} />} 
            {systemMessage.type === 'success' && <Check size={18} />} 
            {(systemMessage.type === 'info' || systemMessage.type === 'warning') && <MessageCircle size={18} />} 
          </div>
          <p className="flex-grow">{systemMessage.text}</p>
          <button onClick={() => setSystemMessage({type: '', text: ''})} className="btn btn-xs btn-ghost absolute top-2 right-2 text-warm-600 hover:text-warm-800">&times;</button>
        </div>
      )}

      {isSettingsOpen && ( 
        <SettingsPanel
          userAgencyName={userAgencyName} setUserAgencyName={setUserAgencyName}
        />
      )}
      
      <AddLeadModal 
        showModal={showAddLeadModal}
        onClose={() => setShowAddLeadModal(false)}
        newLeadData={newLeadData}
        onInputChange={handleNewLeadInputChange}
        onSubmit={handleCreateLead}
        isActionInProgress={isSending}
      />

      <LeadManagementView
        leads={leads}
        selectedLead={selectedLead}
        isLoadingLeads={isLoadingLeads}
        isLoadingGemini={isLoadingGemini}
        isSending={isSending}
        geminiMessage={geminiMessage}
        leadReply={leadReply}
        isCopied={isCopied}
        onLoadLeads={loadLeads}
        onSelectLead={handleSelectLead}
        onDeleteLead={handleDeleteLead}
        onToggleAIPause={handleToggleAIPause}
        onLeadReplyChange={setLeadReply}
        onLeadReplySubmit={handleLeadReplySubmit}
        onGeminiMessageChange={setGeminiMessage}
        onNurtureWithGemini={handleNurtureWithGemini}
        onSendEugeniaMessage={handleSendEugeniaMessage}
        onCopyMessage={copyLeadMessageToClipboard}
        isAnyActionInProgress={isAnyActionInProgress}
      />

      <footer className="text-center p-4 text-sm text-warm-600 border-t border-warm-200 mt-auto bg-warm-50/50"> 
        FUB {AI_SENDER_NAME} ISA v1.0.0 - AI Backend Integration 
      </footer>
    </div>
  );
};

// Root component with Router and Auth
const AppWithRouter = () => {
  return (
    <AuthWrapper>
      <Router>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/conversation/:leadId" element={<App />} />
        </Routes>
      </Router>
    </AuthWrapper>
  );
};

export default AppWithRouter;