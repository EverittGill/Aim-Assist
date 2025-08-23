import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import apiService from '../services/apiService';

const Conversation = () => {
  const { leadId } = useParams();
  const [lead, setLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [aiGeneratedMessage, setAiGeneratedMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (leadId) {
      fetchLeadAndConversation();
    }
  }, [leadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchLeadAndConversation = async () => {
    try {
      setLoading(true);
      
      // Fetch lead details and conversation in parallel
      const [leadResponse, conversationResponse] = await Promise.all([
        apiService.leads.get(leadId),
        apiService.conversations.getMessages(leadId)
      ]);
      
      setLead(leadResponse.data);
      setMessages(conversationResponse.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching conversation:', err);
      setError('Failed to load conversation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateAIMessage = async () => {
    try {
      setGeneratingAI(true);
      setError('');
      
      const response = await apiService.conversations.generateAIResponse(leadId, {
        conversation: messages.slice(-10), // Last 10 messages for context
        template: 'conversation_reply'
      });
      
      setAiGeneratedMessage(response.data.content);
      setShowAIPanel(true);
    } catch (err) {
      console.error('Error generating AI message:', err);
      setError('Failed to generate AI message. Please try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const sendMessage = async (content, isAI = false) => {
    try {
      setSendingMessage(true);
      setError('');
      
      const response = await apiService.conversations.sendMessage(leadId, content);
      
      // Add the sent message to local state
      const newMsg = {
        id: response.data.message.id,
        content: content,
        direction: 'outbound',
        sender_type: isAI ? 'ai' : 'human',
        created_at: new Date().toISOString(),
        status: 'sent'
      };
      
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
      setAiGeneratedMessage('');
      setShowAIPanel(false);
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendManualMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && !sendingMessage) {
      sendMessage(newMessage.trim(), false);
    }
  };

  const handleSendAIMessage = () => {
    if (aiGeneratedMessage.trim() && !sendingMessage) {
      sendMessage(aiGeneratedMessage.trim(), true);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const groupMessagesByDate = (messages) => {
    const groups = {};
    messages.forEach(message => {
      const date = formatDate(message.created_at);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    return groups;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200">
        <NavBar />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="loading loading-spinner loading-lg"></div>
              <p className="mt-4 text-base-content/60">Loading conversation...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-base-200">
        <NavBar />
        <div className="container mx-auto px-4 py-6">
          <div className="alert alert-error">
            <span>Lead not found</span>
          </div>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="min-h-screen bg-base-200">
      <NavBar />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/leads" className="btn btn-ghost btn-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Leads
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{lead.name}</h1>
              <div className="flex items-center gap-2 text-sm text-base-content/70">
                {lead.phone && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {lead.phone}
                  </span>
                )}
                {lead.source && (
                  <span className="badge badge-sm badge-outline">{lead.source}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={generateAIMessage}
              disabled={generatingAI}
              className="btn btn-primary btn-sm"
            >
              {generatingAI ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Generate AI Response
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error mb-6">
            <span>{error}</span>
          </div>
        )}

        {/* Conversation Container */}
        <div className="bg-base-100 rounded-lg shadow-lg flex flex-col h-[600px]">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {Object.keys(messageGroups).length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-lg font-semibold mb-2">No conversation yet</h3>
                <p className="text-base-content/70">
                  Start a conversation with this lead using AI or send a manual message.
                </p>
              </div>
            ) : (
              Object.entries(messageGroups).map(([date, dayMessages]) => (
                <div key={date}>
                  {/* Date Separator */}
                  <div className="flex items-center justify-center my-4">
                    <div className="bg-base-200 text-base-content/70 text-xs px-3 py-1 rounded-full">
                      {date}
                    </div>
                  </div>
                  
                  {/* Messages for this date */}
                  {dayMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat ${message.direction === 'outbound' ? 'chat-end' : 'chat-start'}`}
                    >
                      <div className="chat-image avatar">
                        <div className="w-8 rounded-full bg-base-300 flex items-center justify-center">
                          {message.direction === 'outbound' ? (
                            message.sender_type === 'ai' ? '🤖' : '👤'
                          ) : (
                            '👥'
                          )}
                        </div>
                      </div>
                      <div className="chat-header text-xs opacity-70">
                        {message.direction === 'outbound' 
                          ? (message.sender_type === 'ai' ? 'AI Assistant' : 'You')
                          : lead.name
                        }
                        <time className="ml-1">{formatTime(message.created_at)}</time>
                      </div>
                      <div className={`chat-bubble ${
                        message.direction === 'outbound' 
                          ? message.sender_type === 'ai' 
                            ? 'chat-bubble-secondary' 
                            : 'chat-bubble-primary'
                          : 'chat-bubble-accent'
                      }`}>
                        {message.content}
                      </div>
                      {message.status && message.direction === 'outbound' && (
                        <div className="chat-footer opacity-50 text-xs">
                          {message.status === 'sent' ? '✓ Sent' : 
                           message.status === 'delivered' ? '✓✓ Delivered' : 
                           message.status === 'failed' ? '✗ Failed' : message.status}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* AI Generated Message Panel */}
          {showAIPanel && aiGeneratedMessage && (
            <div className="border-t border-base-300 bg-secondary/10 p-4">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span>🤖</span>
                  AI Generated Response
                </h4>
                <button 
                  onClick={() => setShowAIPanel(false)}
                  className="btn btn-ghost btn-xs"
                >
                  ✕
                </button>
              </div>
              <div className="bg-base-100 rounded-lg p-3 mb-3 border">
                <p className="text-sm">{aiGeneratedMessage}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSendAIMessage}
                  disabled={sendingMessage}
                  className="btn btn-primary btn-sm"
                >
                  {sendingMessage ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send AI Message
                    </>
                  )}
                </button>
                <button
                  onClick={() => setAiGeneratedMessage('')}
                  className="btn btn-outline btn-sm"
                >
                  Edit Message
                </button>
              </div>
            </div>
          )}

          {/* Message Input */}
          <div className="border-t border-base-300 p-4">
            <form onSubmit={handleSendManualMessage} className="flex gap-2">
              <input
                type="text"
                value={aiGeneratedMessage || newMessage}
                onChange={(e) => {
                  if (aiGeneratedMessage) {
                    setAiGeneratedMessage(e.target.value);
                  } else {
                    setNewMessage(e.target.value);
                  }
                }}
                placeholder="Type your message..."
                className="input input-bordered flex-1"
                disabled={sendingMessage}
              />
              <button
                type="submit"
                disabled={sendingMessage || (!newMessage.trim() && !aiGeneratedMessage.trim())}
                className="btn btn-primary"
              >
                {sendingMessage ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
            <div className="text-xs text-base-content/60 mt-2">
              Press Enter to send • Click "Generate AI Response" for AI assistance
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Conversation;