import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Users, MessageSquare, 
  Clock, Target, AlertCircle, Settings, 
  Bot, Phone, DollarSign, Activity 
} from 'lucide-react';
import LeadList from './LeadList';
import ConversationView from './ConversationView';
import SettingsPanel from './SettingsPanel';
import { apiService } from '../services/apiService';

const Dashboard = ({ user, tenant }) => {
  const [activeTab, setActiveTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, [tenant?.id]);

  // Load messages when lead selected
  useEffect(() => {
    if (selectedLead) {
      loadMessages(selectedLead.id);
    }
  }, [selectedLead]);

  const loadDashboardData = async () => {
    if (!tenant?.id) return;
    
    setIsLoading(true);
    try {
      // Load leads and stats in parallel
      const [leadsData, statsData] = await Promise.all([
        apiService.getLeads(tenant.id),
        apiService.getTenantStats(tenant.id)
      ]);
      
      setLeads(leadsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (leadId) => {
    try {
      const messages = await apiService.getConversation(leadId);
      setMessages(messages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (messageData) => {
    setIsSending(true);
    try {
      const result = await apiService.sendMessage(messageData);
      
      // Add message to local state
      setMessages([...messages, result.message]);
      
      // Update lead status if needed
      if (result.leadUpdate) {
        setLeads(leads.map(l => 
          l.id === selectedLead.id 
            ? { ...l, ...result.leadUpdate }
            : l
        ));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateAI = async (lead, conversation) => {
    try {
      const response = await apiService.generateAIMessage({
        lead_id: lead.id,
        conversation,
        template: 'conversation_reply'
      });
      return response.content;
    } catch (error) {
      console.error('Error generating AI message:', error);
      return null;
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      loadDashboardData();
      return;
    }
    
    // Filter leads locally for now
    const filtered = leads.filter(lead => 
      lead.name?.toLowerCase().includes(query.toLowerCase()) ||
      lead.email?.toLowerCase().includes(query.toLowerCase()) ||
      lead.phone?.includes(query)
    );
    setLeads(filtered);
  };

  const StatCard = ({ icon: Icon, label, value, trend, color = 'blue' }) => {
    const colors = {
      blue: 'bg-blue-50 text-blue-600 border-blue-200',
      green: 'bg-green-50 text-green-600 border-green-200',
      purple: 'bg-purple-50 text-purple-600 border-purple-200',
      orange: 'bg-orange-50 text-orange-600 border-orange-200'
    };
    
    return (
      <div className={`p-4 rounded-lg border ${colors[color]} bg-opacity-50`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {trend && (
              <p className="text-xs mt-1 flex items-center gap-1">
                <TrendingUp size={12} />
                {trend}
              </p>
            )}
          </div>
          <Icon size={32} className="opacity-50" />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo/Brand */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">Aim Assist</h1>
          <p className="text-xs text-gray-500 mt-1">{tenant?.name || 'Loading...'}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveTab('leads')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  activeTab === 'leads' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Users size={20} />
                <span>Leads</span>
                {stats?.active_leads > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {stats.active_leads}
                  </span>
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  activeTab === 'analytics' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <BarChart3 size={20} />
                <span>Analytics</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('automation')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  activeTab === 'automation' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Bot size={20} />
                <span>Automation</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <Settings size={20} />
                <span>Settings</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.email || 'User'}
              </p>
              <p className="text-xs text-gray-500">
                {user?.role || 'Agent'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-xl">
              <input
                type="text"
                placeholder="Search leads by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-4 ml-6">
              <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                + New Lead
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'leads' && (
            <div className="h-full flex">
              {/* Lead List */}
              <div className="w-96 border-r border-gray-200 overflow-y-auto p-4 bg-white">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Active Leads</h2>
                  <p className="text-sm text-gray-500">
                    {leads.length} lead{leads.length !== 1 ? 's' : ''} found
                  </p>
                </div>
                
                <LeadList
                  leads={leads}
                  selectedLead={selectedLead}
                  onSelectLead={setSelectedLead}
                  isLoading={isLoading}
                />
              </div>

              {/* Conversation View */}
              <div className="flex-1 bg-white">
                <ConversationView
                  lead={selectedLead}
                  messages={messages}
                  isLoading={isLoading}
                  isSending={isSending}
                  onSendMessage={handleSendMessage}
                  onGenerateAI={handleGenerateAI}
                  tenantSettings={tenant?.settings}
                />
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="p-6 overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Analytics Dashboard</h2>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard
                  icon={Users}
                  label="Total Leads"
                  value={stats?.total_leads || 0}
                  trend="+12% this week"
                  color="blue"
                />
                <StatCard
                  icon={MessageSquare}
                  label="Messages Sent"
                  value={stats?.messages_sent || 0}
                  trend="+25% today"
                  color="green"
                />
                <StatCard
                  icon={Target}
                  label="Qualified Leads"
                  value={stats?.qualified_leads || 0}
                  trend="+8% this month"
                  color="purple"
                />
                <StatCard
                  icon={DollarSign}
                  label="Conversion Rate"
                  value={`${stats?.conversion_rate || 0}%`}
                  trend="+3% this quarter"
                  color="orange"
                />
              </div>

              {/* Placeholder Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">Lead Sources</h3>
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    <BarChart3 size={48} />
                    <span className="ml-2">Chart placeholder</span>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">Response Times</h3>
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    <Activity size={48} />
                    <span className="ml-2">Chart placeholder</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'automation' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Automation Rules</h2>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Auto-Text Rules</h3>
                  <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                    + New Rule
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Website Leads</h4>
                        <p className="text-sm text-gray-600">Send welcome message after 1 minute</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                        <button className="text-gray-500 hover:text-gray-700">
                          <Settings size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Zillow Leads</h4>
                        <p className="text-sm text-gray-600">Send property info after 5 minutes</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                        <button className="text-gray-500 hover:text-gray-700">
                          <Settings size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          tenant={tenant}
          onClose={() => setShowSettings(false)}
          onSave={(settings) => {
            // Update tenant settings
            console.log('Saving settings:', settings);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;