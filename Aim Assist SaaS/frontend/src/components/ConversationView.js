import React, { useRef, useEffect, useState } from 'react';
import { Send, Bot, User, RefreshCw, Phone, AlertCircle, CheckCircle } from 'lucide-react';

const ConversationView = ({ 
  lead, 
  messages, 
  isLoading, 
  isSending,
  onSendMessage,
  onGenerateAI,
  tenantSettings
}) => {
  const chatRef = useRef(null);
  const [messageText, setMessageText] = useState('');
  const [messageMode, setMessageMode] = useState('ai'); // 'ai' or 'manual'
  const [generatedMessage, setGeneratedMessage] = useState('');

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim()) return;
    
    await onSendMessage({
      lead_id: lead.id,
      content: messageText,
      type: messageMode,
      sender: messageMode === 'ai' ? 'assistant' : 'user'
    });
    
    setMessageText('');
  };

  const handleGenerateAI = async () => {
    const generated = await onGenerateAI(lead, messages);
    if (generated) {
      setGeneratedMessage(generated);
      setMessageText(generated);
      setMessageMode('ai');
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const getMessageAlignment = (msg) => {
    return msg.direction === 'outbound' || msg.sender === 'assistant' ? 'justify-end' : 'justify-start';
  };

  const getMessageStyle = (msg) => {
    const isOutbound = msg.direction === 'outbound' || msg.sender === 'assistant';
    return isOutbound 
      ? 'bg-blue-500 text-white rounded-br-none' 
      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none';
  };

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <User size={48} className="mx-auto mb-2 opacity-50" />
          <p>Select a lead to view conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-semibold text-lg">{lead.name || 'Unknown Lead'}</h2>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              {lead.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={14} />
                  {lead.phone}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                lead.ai_status === 'active' ? 'bg-green-100 text-green-700' :
                lead.ai_status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                AI: {lead.ai_status || 'inactive'}
              </span>
            </div>
          </div>
          
          {tenantSettings?.agency_name && (
            <div className="text-sm text-gray-500">
              {tenantSettings.agency_name}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={chatRef}
        className="flex-1 overflow-y-auto p-4 bg-gray-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23f3f4f6' fill-opacity='0.5'%3E%3Cpath d='M0 0h20L10 10zm10 10l10 10V10z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {(!messages || messages.length === 0) ? (
          <div className="text-center py-12">
            <Bot size={48} className="mx-auto mb-3 text-gray-400" />
            <p className="text-gray-500">No messages yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Start the conversation with an AI-generated message
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex ${getMessageAlignment(msg)}`}>
                <div className="max-w-[70%]">
                  <div className={`px-4 py-2 rounded-lg shadow-sm ${getMessageStyle(msg)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {msg.direction === 'outbound' || msg.sender === 'assistant' ? (
                        <Bot size={14} />
                      ) : (
                        <User size={14} />
                      )}
                      <span className="text-xs opacity-75">
                        {msg.direction === 'outbound' || msg.sender === 'assistant' 
                          ? tenantSettings?.agency_name || 'AI Assistant'
                          : lead.name}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.content || msg.body}</p>
                    {msg.status === 'failed' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-red-200">
                        <AlertCircle size={12} />
                        Failed to send
                      </div>
                    )}
                    {msg.status === 'delivered' && (
                      <div className="flex items-center gap-1 mt-2 text-xs opacity-60">
                        <CheckCircle size={12} />
                        Delivered
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 px-1">
                    {formatTimestamp(msg.created_at || msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-white p-4">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600">Send as:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setMessageMode('ai')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                messageMode === 'ai' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              <Bot size={14} className="inline mr-1" />
              AI Assistant
            </button>
            <button
              onClick={() => setMessageMode('manual')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                messageMode === 'manual' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              <User size={14} className="inline mr-1" />
              Manual
            </button>
          </div>
        </div>

        {/* Message Input */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={messageMode === 'ai' ? "Type AI message..." : "Type your message..."}
            maxLength={160}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            disabled={isSending}
          />
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            title="Generate AI message"
          >
            {isLoading ? (
              <RefreshCw size={20} className="animate-spin text-gray-600" />
            ) : (
              <Bot size={20} className="text-gray-600" />
            )}
          </button>
          <button
            type="submit"
            disabled={!messageText.trim() || isSending}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>

        {/* Character Count */}
        <div className="text-xs text-gray-500 mt-2 text-right">
          {messageText.length}/160 characters
        </div>

        {/* AI Status Warning */}
        {lead.ai_status === 'paused' && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            ⚠️ AI is paused for this lead. Messages will be sent manually.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationView;