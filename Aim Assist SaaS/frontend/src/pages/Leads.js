import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import apiService from '../services/apiService';

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [aiStatusFilter, setAiStatusFilter] = useState('all');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const response = await apiService.leads.list();
      setLeads(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError('Failed to fetch leads. Please check your CRM integration.');
    } finally {
      setLoading(false);
    }
  };

  const updateAIStatus = async (leadId, newStatus) => {
    try {
      await apiService.leads.updateAIStatus(leadId, newStatus);
      
      // Update local state
      setLeads(prevLeads => 
        prevLeads.map(lead => 
          lead.id === leadId 
            ? { ...lead, ai_status: newStatus }
            : lead
        )
      );
    } catch (err) {
      console.error('Error updating AI status:', err);
      alert('Failed to update AI status');
    }
  };

  // Filter leads based on search and filters
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' || 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.phone && lead.phone.includes(searchTerm));
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesAIStatus = aiStatusFilter === 'all' || lead.ai_status === aiStatusFilter;
    
    return matchesSearch && matchesStatus && matchesAIStatus;
  });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'new': return 'badge-primary';
      case 'contacted': return 'badge-info';
      case 'qualified': return 'badge-success';
      case 'appointment': return 'badge-warning';
      case 'closed': return 'badge-neutral';
      default: return 'badge-ghost';
    }
  };

  const getAIStatusColor = (aiStatus) => {
    switch (aiStatus?.toLowerCase()) {
      case 'active': return 'badge-success';
      case 'paused': return 'badge-warning';
      case 'inactive': return 'badge-neutral';
      default: return 'badge-ghost';
    }
  };

  const getAIStatusText = (aiStatus) => {
    switch (aiStatus?.toLowerCase()) {
      case 'active': return '🤖 AI Active';
      case 'paused': return '⏸️ AI Paused';
      case 'inactive': return '⭕ AI Off';
      default: return '❓ Unknown';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200">
        <NavBar />
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="loading loading-spinner loading-lg"></div>
              <p className="mt-4 text-base-content/60">Loading your leads...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <NavBar />
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-3xl font-bold mb-4 sm:mb-0">Leads</h1>
          <div className="flex gap-2">
            <button 
              onClick={fetchLeads}
              className="btn btn-outline btn-sm"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="card bg-base-100 shadow-sm mb-6">
          <div className="card-body p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="form-control flex-1">
                <input
                  type="text"
                  placeholder="Search leads by name, email, or phone..."
                  className="input input-bordered"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              {/* Status Filter */}
              <div className="form-control">
                <select
                  className="select select-bordered"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="appointment">Appointment</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              
              {/* AI Status Filter */}
              <div className="form-control">
                <select
                  className="select select-bordered"
                  value={aiStatusFilter}
                  onChange={(e) => setAiStatusFilter(e.target.value)}
                >
                  <option value="all">All AI Status</option>
                  <option value="active">AI Active</option>
                  <option value="paused">AI Paused</option>
                  <option value="inactive">AI Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4">
          <p className="text-sm text-base-content/70">
            Showing {filteredLeads.length} of {leads.length} leads
          </p>
        </div>

        {/* Leads Grid */}
        {filteredLeads.length === 0 ? (
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body text-center py-12">
              <div className="text-6xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold mb-2">
                {leads.length === 0 ? 'No leads found' : 'No matching leads'}
              </h3>
              <p className="text-base-content/70 mb-4">
                {leads.length === 0 
                  ? 'Your leads will appear here once your CRM integration is syncing.'
                  : 'Try adjusting your search or filter criteria.'
                }
              </p>
              {leads.length === 0 && (
                <button 
                  onClick={fetchLeads}
                  className="btn btn-primary"
                >
                  Sync Leads from CRM
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredLeads.map((lead) => (
              <div key={lead.id} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="card-body p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Lead Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{lead.name}</h3>
                        <div className="flex gap-2">
                          <span className={`badge badge-sm ${getStatusColor(lead.status)}`}>
                            {lead.status || 'new'}
                          </span>
                          <span className={`badge badge-sm ${getAIStatusColor(lead.ai_status)}`}>
                            {getAIStatusText(lead.ai_status)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-sm text-base-content/70 space-y-1">
                        {lead.email && (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {lead.phone}
                          </div>
                        )}
                        {lead.source && (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            {lead.source}
                          </div>
                        )}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            <div className="flex gap-1 flex-wrap">
                              {lead.tags.slice(0, 3).map((tag, index) => (
                                <span key={index} className="badge badge-xs badge-outline">
                                  {tag}
                                </span>
                              ))}
                              {lead.tags.length > 3 && (
                                <span className="badge badge-xs badge-outline">
                                  +{lead.tags.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      {/* AI Status Toggle */}
                      <div className="dropdown dropdown-end">
                        <label tabIndex={0} className="btn btn-sm btn-outline">
                          AI Control
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </label>
                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-40">
                          <li>
                            <button 
                              onClick={() => updateAIStatus(lead.id, 'active')}
                              className={lead.ai_status === 'active' ? 'active' : ''}
                            >
                              🤖 Activate AI
                            </button>
                          </li>
                          <li>
                            <button 
                              onClick={() => updateAIStatus(lead.id, 'paused')}
                              className={lead.ai_status === 'paused' ? 'active' : ''}
                            >
                              ⏸️ Pause AI
                            </button>
                          </li>
                          <li>
                            <button 
                              onClick={() => updateAIStatus(lead.id, 'inactive')}
                              className={lead.ai_status === 'inactive' ? 'active' : ''}
                            >
                              ⭕ Turn Off AI
                            </button>
                          </li>
                        </ul>
                      </div>

                      {/* Chat Button */}
                      <Link 
                        to={`/conversation/${lead.id}`}
                        className="btn btn-sm btn-primary"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a9.863 9.863 0 01-4.906-1.284L3 21l2.284-5.094A9.863 9.863 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                        </svg>
                        Chat
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leads;