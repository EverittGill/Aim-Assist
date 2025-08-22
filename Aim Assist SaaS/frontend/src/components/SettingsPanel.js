import React, { useState, useEffect } from 'react';
import { 
  X, Save, AlertCircle, CheckCircle, 
  Building, Phone, Bot, Clock, 
  CreditCard, Key, Database, Bell 
} from 'lucide-react';

const SettingsPanel = ({ tenant, onClose, onSave }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState({
    // General
    agency_name: '',
    primary_phone: '',
    timezone: 'America/New_York',
    business_hours_enabled: false,
    business_hours: { start: '09:00', end: '17:00' },
    
    // CRM Integration
    crm_provider: 'followupboss',
    crm_api_key: '',
    crm_settings: {},
    
    // AI Configuration
    ai_provider: 'gemini',
    ai_temperature: 0.7,
    ai_max_tokens: 100,
    ai_model: 'gemini-pro',
    
    // Auto-Text
    auto_text_enabled: false,
    auto_text_sources: [],
    auto_text_delay_minutes: 1,
    
    // Notifications
    notification_email: '',
    notification_phone: '',
    notify_on_qualified: true,
    notify_on_escalation: true,
    
    // Billing
    subscription_tier: 'starter',
    max_leads: 100,
    max_messages: 1000
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (tenant?.settings) {
      setSettings(prev => ({ ...prev, ...tenant.settings }));
    }
  }, [tenant]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      await onSave(settings);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'general', label: 'General', icon: Building },
    { id: 'crm', label: 'CRM Integration', icon: Database },
    { id: 'ai', label: 'AI Settings', icon: Bot },
    { id: 'autotext', label: 'Auto-Text', icon: Clock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'billing', label: 'Billing', icon: CreditCard }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-200 p-4">
            <nav className="space-y-1">
              {sections.map(section => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      activeSection === section.id 
                        ? 'bg-blue-50 text-blue-600' 
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'general' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">General Settings</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agency Name
                  </label>
                  <input
                    type="text"
                    value={settings.agency_name}
                    onChange={(e) => setSettings({...settings, agency_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Your Real Estate Agency"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Phone Number
                  </label>
                  <input
                    type="text"
                    value={settings.primary_phone}
                    onChange={(e) => setSettings({...settings, primary_phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="+1234567890"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => setSettings({...settings, timezone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.business_hours_enabled}
                      onChange={(e) => setSettings({...settings, business_hours_enabled: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable Business Hours</span>
                  </label>
                  
                  {settings.business_hours_enabled && (
                    <div className="mt-3 ml-6 flex items-center gap-2">
                      <input
                        type="time"
                        value={settings.business_hours.start}
                        onChange={(e) => setSettings({
                          ...settings, 
                          business_hours: {...settings.business_hours, start: e.target.value}
                        })}
                        className="px-2 py-1 border border-gray-300 rounded"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="time"
                        value={settings.business_hours.end}
                        onChange={(e) => setSettings({
                          ...settings, 
                          business_hours: {...settings.business_hours, end: e.target.value}
                        })}
                        className="px-2 py-1 border border-gray-300 rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'crm' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">CRM Integration</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CRM Provider
                  </label>
                  <select
                    value={settings.crm_provider}
                    onChange={(e) => setSettings({...settings, crm_provider: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="followupboss">Follow Up Boss</option>
                    <option value="lofty">Lofty</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.crm_api_key}
                    onChange={(e) => setSettings({...settings, crm_api_key: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Enter your CRM API key"
                  />
                </div>

                {settings.crm_provider === 'followupboss' && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium mb-1">Follow Up Boss Configuration</p>
                        <p>Make sure to create custom fields in FUB:</p>
                        <ul className="list-disc list-inside mt-1">
                          <li>Eugenia Talking Status</li>
                          <li>Aim Assist Link</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">AI Configuration</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AI Provider
                  </label>
                  <select
                    value={settings.ai_provider}
                    onChange={(e) => setSettings({...settings, ai_provider: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="gemini">Gemini (Google)</option>
                    <option value="openai">GPT-4 (OpenAI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature (0.1 - 1.0)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={settings.ai_temperature}
                    onChange={(e) => setSettings({...settings, ai_temperature: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Lower = more consistent, Higher = more creative
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Tokens (Response Length)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="200"
                    value={settings.ai_max_tokens}
                    onChange={(e) => setSettings({...settings, ai_max_tokens: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    SMS limit is 160 characters
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'autotext' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">Auto-Text Settings</h3>
                
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.auto_text_enabled}
                      onChange={(e) => setSettings({...settings, auto_text_enabled: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable Auto-Text</span>
                  </label>
                </div>

                {settings.auto_text_enabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lead Sources
                      </label>
                      <div className="space-y-2">
                        {['website', 'zillow', 'realtor.com', 'facebook', 'google'].map(source => (
                          <label key={source} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={settings.auto_text_sources.includes(source)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSettings({
                                    ...settings,
                                    auto_text_sources: [...settings.auto_text_sources, source]
                                  });
                                } else {
                                  setSettings({
                                    ...settings,
                                    auto_text_sources: settings.auto_text_sources.filter(s => s !== source)
                                  });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm capitalize">{source}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delay (minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={settings.auto_text_delay_minutes}
                        onChange={(e) => setSettings({...settings, auto_text_delay_minutes: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Wait time before sending auto-text
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">Notification Settings</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notification Email
                  </label>
                  <input
                    type="email"
                    value={settings.notification_email}
                    onChange={(e) => setSettings({...settings, notification_email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="alerts@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notification Phone (SMS)
                  </label>
                  <input
                    type="text"
                    value={settings.notification_phone}
                    onChange={(e) => setSettings({...settings, notification_phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="+1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_qualified}
                      onChange={(e) => setSettings({...settings, notify_on_qualified: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm">Notify when lead is qualified</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_escalation}
                      onChange={(e) => setSettings({...settings, notify_on_escalation: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm">Notify on escalation request</span>
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'billing' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4">Billing & Limits</h3>
                
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Current Plan</span>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {settings.subscription_tier}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max Leads</span>
                      <span className="font-medium">{settings.max_leads}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max Messages/Month</span>
                      <span className="font-medium">{settings.max_messages}</span>
                    </div>
                  </div>
                  
                  <button className="w-full mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                    Upgrade Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div>
            {saveStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle size={16} />
                <span className="text-sm">Settings saved successfully</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle size={16} />
                <span className="text-sm">Error saving settings</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;