import React, { useState, useEffect } from 'react';
import apiService from '../services/apiService';

function PromptEditor({ isOpen, onClose }) {
  const [prompts, setPrompts] = useState({
    conversationReply: '',
    initialOutreach: '',
    escalationKeywords: [],
    expertQuestions: []
  });
  const [activeTab, setActiveTab] = useState('conversation');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchPrompts();
    }
  }, [isOpen]);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPrompts();
      if (response.success) {
        setPrompts(response.prompts);
      }
    } catch (error) {
      console.error('Error fetching prompts:', error);
      setMessage('Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async (promptName, content) => {
    try {
      setSaving(true);
      setMessage('');
      
      const response = await apiService.updatePrompt(promptName, content);
      if (response.success) {
        setMessage('Prompt saved successfully!');
        // Refresh prompts
        fetchPrompts();
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      setMessage('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (window.confirm('Are you sure you want to reset all prompts to defaults?')) {
      try {
        setSaving(true);
        const response = await apiService.resetPrompts();
        if (response.success) {
          setMessage('Prompts reset to defaults');
          fetchPrompts();
        }
      } catch (error) {
        console.error('Error resetting prompts:', error);
        setMessage('Failed to reset prompts');
      } finally {
        setSaving(false);
      }
    }
  };

  const handlePromptChange = (promptName, value) => {
    setPrompts(prev => ({
      ...prev,
      [promptName]: value
    }));
  };

  const handleKeywordChange = (keywords) => {
    const keywordArray = keywords.split('\n').filter(k => k.trim());
    setPrompts(prev => ({
      ...prev,
      escalationKeywords: keywordArray
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-base-300">
          <h2 className="text-2xl font-bold">Prompt Editor</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">✕</button>
        </div>

        {/* Message */}
        {message && (
          <div className={`alert ${message.includes('Failed') ? 'alert-error' : 'alert-success'} mx-6 mt-4`}>
            <span>{message}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Tabs */}
              <div className="tabs tabs-boxed mb-4">
                <button 
                  className={`tab ${activeTab === 'conversation' ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab('conversation')}
                >
                  Conversation Reply
                </button>
                <button 
                  className={`tab ${activeTab === 'initial' ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab('initial')}
                >
                  Initial Outreach
                </button>
                <button 
                  className={`tab ${activeTab === 'keywords' ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab('keywords')}
                >
                  Escalation Keywords
                </button>
                <button 
                  className={`tab ${activeTab === 'help' ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab('help')}
                >
                  Help
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto">
                {activeTab === 'conversation' && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">
                        <span className="label-text">Conversation Reply Prompt</span>
                        <span className="label-text-alt">Used for ongoing conversations</span>
                      </label>
                      <textarea
                        className="textarea textarea-bordered w-full h-96 font-mono text-sm"
                        value={prompts.conversationReply}
                        onChange={(e) => handlePromptChange('conversationReply', e.target.value)}
                        placeholder="Enter prompt template..."
                      />
                    </div>
                    <button 
                      className="btn btn-primary"
                      onClick={() => savePrompt('conversationReply', prompts.conversationReply)}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Conversation Prompt'}
                    </button>
                  </div>
                )}

                {activeTab === 'initial' && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">
                        <span className="label-text">Initial Outreach Prompt</span>
                        <span className="label-text-alt">Used for first contact with leads</span>
                      </label>
                      <textarea
                        className="textarea textarea-bordered w-full h-96 font-mono text-sm"
                        value={prompts.initialOutreach}
                        onChange={(e) => handlePromptChange('initialOutreach', e.target.value)}
                        placeholder="Enter prompt template..."
                      />
                    </div>
                    <button 
                      className="btn btn-primary"
                      onClick={() => savePrompt('initialOutreach', prompts.initialOutreach)}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Initial Prompt'}
                    </button>
                  </div>
                )}

                {activeTab === 'keywords' && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">
                        <span className="label-text">Escalation Keywords</span>
                        <span className="label-text-alt">One keyword per line - triggers human handoff</span>
                      </label>
                      <textarea
                        className="textarea textarea-bordered w-full h-64"
                        value={prompts.escalationKeywords.join('\n')}
                        onChange={(e) => handleKeywordChange(e.target.value)}
                        placeholder="Enter keywords, one per line..."
                      />
                    </div>
                    <button 
                      className="btn btn-primary"
                      onClick={() => savePrompt('escalationKeywords', prompts.escalationKeywords)}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Keywords'}
                    </button>
                  </div>
                )}

                {activeTab === 'help' && (
                  <div className="prose max-w-none">
                    <h3>Prompt Template Variables</h3>
                    <p>You can use these variables in your prompts:</p>
                    <ul>
                      <li><code>${'{agencyName}'}</code> - Your agency name</li>
                      <li><code>${'{leadDetails.name}'}</code> - Lead's name</li>
                      <li><code>${'{leadDetails.source}'}</code> - Lead source</li>
                      <li><code>${'{leadDetails.tags}'}</code> - Lead tags</li>
                      <li><code>${'{conversationHistory}'}</code> - Full conversation history</li>
                      <li><code>${'{currentMessage}'}</code> - Latest message from lead</li>
                      <li><code>${'{messageCount}'}</code> - Number of messages from lead</li>
                      <li><code>${'{totalMessages}'}</code> - Total messages exchanged</li>
                    </ul>

                    <h3>Best Practices</h3>
                    <ul>
                      <li>Keep prompts clear and specific</li>
                      <li>Emphasize the 160 character SMS limit</li>
                      <li>Include escalation rules (3-message rule)</li>
                      <li>Test prompts with various scenarios</li>
                      <li>Avoid using emojis in prompts</li>
                    </ul>

                    <h3>Template Format</h3>
                    <p>Prompts should be written as template strings. Variables will be replaced with actual values when the AI generates responses.</p>
                    
                    <div className="alert alert-warning">
                      <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span>Changes to prompts affect all AI responses immediately. Test carefully!</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-base-300">
          <button 
            className="btn btn-error btn-outline"
            onClick={resetToDefaults}
            disabled={saving}
          >
            Reset to Defaults
          </button>
          <button onClick={onClose} className="btn">Close</button>
        </div>
      </div>
    </div>
  );
}

export default PromptEditor;