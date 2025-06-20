import React, { useRef, useEffect, useState } from 'react';
import { 
  Bot, Send, User, Copy, Check, RefreshCw, ChevronDown, ChevronUp, Info
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
  isAnyActionInProgress,
  searchQuery
}) => {
  const chatContainerRef = useRef(null);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [simulateLeadReply, setSimulateLeadReply] = useState(false);
  
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
      {searchQuery.trim() && (
        <div className="md:w-1/3 bg-white/80 backdrop-blur-sm border border-warm-200 p-5 rounded-xl shadow-warm-lg flex flex-col max-h-[calc(100vh-280px)] md:max-h-[calc(100vh-240px)]">
          <div className="flex justify-between items-center mb-4"> 
            <h2 className="text-2xl font-semibold text-brand-800">Search Results</h2> 
            <span className="text-sm text-warm-600">{leads.length} found</span>
          </div>
          {!leads.length && <p className="text-center text-warm-600 py-4">No leads match your search.</p>}
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
      )}
      
      <div className={`${searchQuery.trim() ? 'md:w-2/3' : 'w-full'} flex flex-col md:flex-row gap-4`}>
        {selectedLead ? (
          <>
            {/* Mobile Details Toggle Button - Only visible on mobile */}
            <div className="md:hidden">
              <button
                onClick={() => setShowMobileDetails(!showMobileDetails)}
                className="w-full flex items-center justify-between p-3 bg-white/80 backdrop-blur-sm border border-warm-200 rounded-lg shadow-sm mb-2"
              >
                <span className="flex items-center gap-2 text-warm-800 font-medium">
                  <Info size={18} />
                  Lead Details
                </span>
                {showMobileDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
            
            {/* Lead Details Column - Collapsible on mobile */}
            <div className={`${showMobileDetails ? 'block' : 'hidden'} md:block md:w-3/5 bg-white/80 backdrop-blur-sm border border-warm-200 p-5 rounded-xl shadow-warm-lg md:max-h-[calc(100vh-120px)] md:overflow-y-auto`}>
              <SelectedLeadDetails 
                lead={selectedLead} 
                onDeleteLead={onDeleteLead} 
                onToggleAIPause={onToggleAIPause}
                isActionInProgress={isSending || isLoadingGemini} 
              />
              
              {/* Additional Lead Information Placeholders */}
              <div className="mt-4 space-y-3 border-t border-warm-200 pt-4">
                {/* Favorited Houses */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">🏠 Favorited Houses</h4>
                  <p className="text-xs text-warm-600 italic">No favorited properties yet</p>
                </div>
                
                {/* Last Contacted */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">📅 Last Contacted</h4>
                  <p className="text-xs text-warm-700">{selectedLead.lastContacted ? new Date(selectedLead.lastContacted).toLocaleString() : 'Never contacted'}</p>
                </div>
                
                {/* Timeframe */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">⏰ Timeframe</h4>
                  <p className="text-xs text-warm-600 italic">Timeframe data not available</p>
                </div>
                
                {/* Budget Range */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">💰 Budget Range</h4>
                  <p className="text-xs text-warm-600 italic">Budget information not available</p>
                </div>
                
                {/* Lead Score */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">⭐ Lead Score</h4>
                  <p className="text-xs text-warm-600 italic">Lead scoring not configured</p>
                </div>
                
                {/* Property Preferences */}
                <div className="bg-warm-50 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-warm-800 mb-1">🏡 Property Preferences</h4>
                  <p className="text-xs text-warm-600 italic">No preferences recorded</p>
                </div>
              </div>
            </div>
            
            {/* Conversation Column - Full width on mobile when details hidden */}
            <div className={`${showMobileDetails ? 'mt-4' : ''} md:mt-0 md:w-2/5 bg-white/80 backdrop-blur-sm border border-warm-200 p-4 md:p-6 rounded-xl shadow-warm-lg flex flex-col overflow-hidden md:max-h-[calc(100vh-120px)]`}>
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <h3 className="text-lg font-semibold text-brand-800 mb-2 flex-shrink-0">💬 SMS Conversation with {selectedLead.name}</h3>
              <div 
                ref={chatContainerRef} 
                className="flex-1 overflow-y-auto space-y-2 pr-2 mb-3 bg-gray-100 border border-warm-200 p-4 rounded-lg scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 hover:scrollbar-thumb-gray-500" 
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="%23f3f4f6" fill-opacity="0.1"%3E%3Cpath d="M0 0h20v20H0z"/%3E%3C/g%3E%3C/svg%3E")',
                  scrollBehavior: 'smooth'
                }}
              >
                {(selectedLead.conversationHistory && selectedLead.conversationHistory.length > 0) ? selectedLead.conversationHistory.map((msg, index) => (
                  <div key={index} className={`group flex ${msg.sender === AI_SENDER_NAME ? 'justify-end' : 'justify-start'} mb-6`}>
                    <div className="relative">
                      <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg shadow-sm ${
                        msg.sender === AI_SENDER_NAME 
                          ? 'bg-blue-500 text-white rounded-br-none' 
                          : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                      }`}>
                        <div className={`text-xs mb-1 ${msg.sender === AI_SENDER_NAME ? 'text-blue-100' : 'text-gray-500'} flex items-center`}>
                          <span>{msg.sender === AI_SENDER_NAME ? AI_SENDER_NAME : selectedLead.name}</span>
                          {/* Beach mode inline timestamp */}
                          <span className="beach-timestamp ml-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {(msg.timestamp || msg.created) ? new Date(msg.timestamp || msg.created).toLocaleString([], { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: 'numeric', 
                              minute: '2-digit' 
                            }) : ''}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text || msg.body}</p>
                      </div>
                      {/* Timestamp on hover */}
                      <div className={`absolute ${msg.sender === AI_SENDER_NAME ? 'right-0' : 'left-0'} -bottom-5 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap`}>
                        {(msg.timestamp || msg.created) ? new Date(msg.timestamp || msg.created).toLocaleString([], { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: 'numeric', 
                          minute: '2-digit' 
                        }) : ''}
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
              <div className="flex-shrink-0 mt-4 border-t border-warm-200 pt-3">
                  {selectedLead.hasValidPhone === false ? (
                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-center">
                      <div className="text-warning text-sm mb-2">⚠️ SMS features disabled</div>
                      <div className="text-warning-dark text-xs">
                        This lead doesn't have a valid phone number. Add a valid phone number in FUB to enable SMS messaging.
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Message Mode Toggle */}
                      <div className="flex items-center justify-between mb-3 p-2 bg-gray-100 rounded-lg">
                        <span className="text-sm font-medium text-gray-700">Message as:</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSimulateLeadReply(false)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              !simulateLeadReply 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            <Bot size={14} className="inline mr-1" />
                            Eugenia
                          </button>
                          <button
                            onClick={() => setSimulateLeadReply(true)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              simulateLeadReply 
                                ? 'bg-green-500 text-white' 
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            <User size={14} className="inline mr-1" />
                            Lead (Simulator)
                          </button>
                        </div>
                      </div>
                      
                      {/* Message Input Form */}
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (simulateLeadReply) {
                          if (leadReply.trim() && !isAnyActionInProgress) {
                            onLeadReplySubmit();
                          }
                        } else {
                          if (geminiMessage.trim() && !isAnyActionInProgress) {
                            onSendEugeniaMessage(selectedLead, geminiMessage);
                          }
                        }
                      }} className="flex gap-2">
                        <input
                          type="text"
                          value={simulateLeadReply ? leadReply : geminiMessage}
                          onChange={(e) => simulateLeadReply ? onLeadReplyChange(e.target.value) : onGeminiMessageChange(e.target.value)}
                          placeholder={simulateLeadReply ? `Type a message as ${selectedLead.name}...` : "Type a message as Eugenia..."}
                          className={`input input-bordered flex-1 bg-white border-warm-300 focus:border-brand-500 ${
                            simulateLeadReply ? 'border-green-300 focus:border-green-500' : ''
                          }`}
                          disabled={isAnyActionInProgress}
                        />
                        <button
                          type="submit"
                          disabled={simulateLeadReply ? (!leadReply.trim() || !selectedLead || isAnyActionInProgress) : (!geminiMessage.trim() || !selectedLead || isAnyActionInProgress)}
                          className={`btn ${simulateLeadReply ? 'btn-success' : 'btn-primary'}`}
                          title="Send message"
                        >
                          {isSending ? <RefreshCw size={20} className="animate-spin"/> : <Send size={20} />}
                        </button>
                      </form>
                      
                      {/* Generate AI Message Button - Only show when in lead simulator mode */}
                      {simulateLeadReply && (
                        <button
                          onClick={() => onNurtureWithGemini(selectedLead, selectedLead.conversationHistory || [])}
                          disabled={isLoadingGemini || isAnyActionInProgress}
                          className="btn btn-sm btn-primary w-full mt-2"
                        >
                          {isLoadingGemini ? (
                            <>
                              <RefreshCw size={14} className="animate-spin mr-1" />
                              Generating AI Response...
                            </>
                          ) : (
                            <>
                              <Bot size={14} className="mr-1" />
                              Generate AI Response
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
              </div>
              </div>
            </div>
          </>
        ) : ( 
          <div className="w-full bg-white/80 backdrop-blur-sm border border-warm-200 p-6 rounded-xl shadow-warm-lg">
            <div className="flex flex-col items-center justify-center h-full text-warm-600 text-center py-20"> 
              <User size={48} className="mb-4 text-warm-500" /> 
              <p className="text-xl">Search for a lead using the search bar above</p> 
              <p className="text-sm mt-2 text-warm-500">Type a name, email, or phone number to find your lead</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default LeadManagementView;