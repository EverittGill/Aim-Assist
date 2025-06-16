import React, { useRef, useEffect } from 'react';
import { 
  Bot, Send, User, Copy, Check, RefreshCw
} from 'lucide-react';
import LeadItem from './LeadItem';
import SelectedLeadDetails from './SelectedLeadDetails';
import { AI_SENDER_NAME } from './constants';

const LeadManagementView = ({
  leads,
  selectedLead,
  isLoadingLeads,
  isLoadingGemini,
  isSending,
  geminiMessage,
  leadReply,
  isCopied,
  onLoadLeads,
  onSelectLead,
  onDeleteLead,
  onToggleAIPause,
  onLeadReplyChange,
  onLeadReplySubmit,
  onGeminiMessageChange,
  onNurtureWithGemini,
  onSendEugeniaMessage,
  onCopyMessage,
  isAnyActionInProgress
}) => {
  const chatContainerRef = useRef(null);
  
  // Auto-scroll to bottom when conversation history changes
  useEffect(() => {
    if (chatContainerRef.current && selectedLead?.conversationHistory) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [selectedLead?.conversationHistory]);
  return (
    <main className="container mx-auto p-4 flex-grow flex flex-col md:flex-row gap-6">
      <div className="md:w-1/3 bg-white/80 backdrop-blur-sm border border-warm-200 p-5 rounded-xl shadow-warm-lg flex flex-col max-h-[calc(100vh-280px)] md:max-h-[calc(100vh-240px)]">
        <div className="flex justify-between items-center mb-4"> 
          <h2 className="text-2xl font-semibold text-brand-800">Leads</h2> 
          <button onClick={() => onLoadLeads(true)} disabled={isAnyActionInProgress} className="btn btn-sm btn-secondary flex items-center"> 
            {isLoadingLeads ? <RefreshCw size={16} className="animate-spin mr-1"/> : null} Fetch Leads 
          </button> 
        </div>
        {isLoadingLeads && <p className="text-center text-warm-600 py-4">Loading leads...</p>}
        {!isLoadingLeads && !leads.length && <p className="text-center text-warm-600 py-4">No leads. Click "Fetch Leads" or add one.</p>}
        <div className="overflow-y-auto space-y-3 pr-2 flex-grow"> 
          {leads.map(lead => ( 
            <LeadItem 
              key={lead.id} 
              lead={lead} 
              onSelectLead={onSelectLead} 
              selectedLeadId={selectedLead?.id} 
              onDeleteLead={onDeleteLead} 
              isActionInProgress={isSending || isLoadingGemini} 
            /> 
          ))} 
        </div>
      </div>
      
      <div className="md:w-2/3 bg-white/80 backdrop-blur-sm border border-warm-200 p-6 rounded-xl shadow-warm-lg flex flex-col overflow-hidden">
        {selectedLead ? (
          <>
            <SelectedLeadDetails 
              lead={selectedLead} 
              onDeleteLead={onDeleteLead} 
              onToggleAIPause={onToggleAIPause}
              isActionInProgress={isSending || isLoadingGemini} 
            />
            <div className="mt-4 border-t border-warm-200 pt-4 flex flex-col flex-1 min-h-0 overflow-hidden">
              <h3 className="text-lg font-semibold text-brand-800 mb-2 flex-shrink-0">💬 SMS Conversation with {selectedLead.name}</h3>
              <div 
                ref={chatContainerRef} 
                className="flex-1 overflow-y-auto space-y-2 pr-2 mb-3 bg-gray-100 border border-warm-200 p-4 rounded-lg max-h-[400px] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 hover:scrollbar-thumb-gray-500" 
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="%23f3f4f6" fill-opacity="0.1"%3E%3Cpath d="M0 0h20v20H0z"/%3E%3C/g%3E%3C/svg%3E")',
                  scrollBehavior: 'smooth'
                }}
              >
                {(selectedLead.conversationHistory && selectedLead.conversationHistory.length > 0) ? selectedLead.conversationHistory.map((msg, index) => (
                  <div key={index} className={`flex ${msg.sender === AI_SENDER_NAME ? 'justify-end' : 'justify-start'} mb-2`}>
                    <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg shadow-sm ${
                      msg.sender === AI_SENDER_NAME 
                        ? 'bg-blue-500 text-white rounded-br-none' 
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    }`}>
                      <div className={`text-xs mb-1 ${msg.sender === AI_SENDER_NAME ? 'text-blue-100' : 'text-gray-500'}`}>
                        {msg.sender === AI_SENDER_NAME ? AI_SENDER_NAME : selectedLead.name}
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <div className={`text-xs mt-1 ${msg.sender === AI_SENDER_NAME ? 'text-blue-200' : 'text-gray-400'}`}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500 text-sm">
                      📱 No messages yet
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      Start a conversation by generating an AI message below
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 mt-2 border-t border-warm-200 pt-3">
                {selectedLead.hasValidPhone === false ? (
                  <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-center">
                    <div className="text-warning text-sm mb-2">⚠️ SMS features disabled</div>
                    <div className="text-warning-dark text-xs">
                      This lead doesn't have a valid phone number. Add a valid phone number in FUB to enable SMS messaging.
                    </div>
                  </div>
                ) : (
                  <>
                    <label htmlFor="leadReply" className="label pb-1"><span className="label-text text-warm-700">Log Lead's Reply (Simulates SMS Inbound):</span></label>
                    <textarea 
                      id="leadReply" 
                      value={leadReply} 
                      onChange={(e) => onLeadReplyChange(e.target.value)} 
                      placeholder={`Enter ${selectedLead.name}'s reply here...`} 
                      rows="3" 
                      className="textarea textarea-bordered w-full bg-white border-warm-300 focus:border-brand-500" 
                      disabled={isAnyActionInProgress}
                    />
                    <button 
                      onClick={onLeadReplySubmit} 
                      disabled={!leadReply.trim() || isAnyActionInProgress} 
                      className="btn btn-sm btn-warning w-full mt-2"
                    > 
                      Log Reply & Get {AI_SENDER_NAME}'s Next 
                    </button>
                  </>
                )}
              </div>
              <div className="flex-shrink-0 mt-4 border-t border-warm-200 pt-3">
                  <h3 className="text-md font-semibold text-brand-800 mb-1 flex items-center"> 
                    <Bot size={20} className="mr-2 text-brand-600" /> {AI_SENDER_NAME}'s Next Message Draft: 
                  </h3>
                  {isLoadingGemini && ( 
                    <div className="flex items-center justify-center h-20 bg-warm-50 border border-warm-200 rounded-lg"> 
                      <RefreshCw size={24} className="animate-spin text-brand-600"/> 
                      <p className="ml-3 text-warm-700">Thinking...</p> 
                    </div> 
                  )}
                  {!isLoadingGemini && ( 
                    <textarea 
                      value={geminiMessage} 
                      onChange={(e) => onGeminiMessageChange(e.target.value)} 
                      placeholder="Draft will appear here..." 
                      rows="5" 
                      className="textarea textarea-bordered w-full bg-white border-warm-300 focus:border-brand-500 min-h-[120px] resize-none" 
                      disabled={isAnyActionInProgress}
                    /> 
                  )}
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                      <button 
                        onClick={() => onNurtureWithGemini(selectedLead, selectedLead.conversationHistory || [])} 
                        disabled={!selectedLead || isAnyActionInProgress || selectedLead.hasValidPhone === false} 
                        className="btn btn-sm btn-success sm:flex-1"
                        title={selectedLead.hasValidPhone === false ? "Valid phone number required" : "Generate AI response"}
                      > 
                        <Bot size={16} className="mr-1.5" /> Regenerate 
                      </button>
                      <button 
                        onClick={() => onSendEugeniaMessage(selectedLead, geminiMessage)} 
                        disabled={!geminiMessage.trim() || !selectedLead || isAnyActionInProgress || selectedLead.hasValidPhone === false} 
                        className="btn btn-sm btn-info sm:flex-1"
                        title={selectedLead.hasValidPhone === false ? "Valid phone number required" : "Send AI message"}
                      > 
                        {isSending ? <RefreshCw size={16} className="animate-spin mr-1.5"/> : <Send size={16} className="mr-1.5" />} 
                        Send as {AI_SENDER_NAME}
                      </button>
                      <button 
                        onClick={() => onCopyMessage(geminiMessage)} 
                        disabled={!geminiMessage.trim() || isAnyActionInProgress} 
                        title="Copy message" 
                        className="btn btn-sm btn-ghost sm:w-auto"
                      > 
                        {isCopied ? <Check size={16} /> : <Copy size={16} />} 
                      </button>
                  </div>
              </div>
            </div>
          </>
        ) : ( 
          <div className="flex flex-col items-center justify-center h-full text-warm-600 text-center"> 
            <User size={48} className="mb-4 text-warm-500" /> 
            <p className="text-xl">Select a lead from the list to view details and nurture.</p> 
          </div>
        )}
      </div>
    </main>
  );
};

export default LeadManagementView;