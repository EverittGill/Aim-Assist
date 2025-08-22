import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Phone, Mail, Tag, Clock, MessageCircle, AlertCircle } from 'lucide-react';

const LeadList = ({ leads, selectedLead, onSelectLead, isLoading }) => {
  const [expandedLeads, setExpandedLeads] = useState(new Set());

  const toggleExpand = (leadId, e) => {
    e.stopPropagation();
    setExpandedLeads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'inactive': return 'text-gray-600 bg-gray-50';
      case 'qualified': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSourceIcon = (source) => {
    const sources = {
      'website': '🌐',
      'zillow': '🏠',
      'realtor.com': '🏡',
      'facebook': '📘',
      'google': '🔍',
      'referral': '👥',
      'phone': '📞',
      'email': '✉️'
    };
    return sources[source?.toLowerCase()] || '📋';
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="bg-gray-100 rounded-lg p-4">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <AlertCircle className="mx-auto mb-2" size={32} />
        <p>No leads found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map(lead => {
        const isExpanded = expandedLeads.has(lead.id);
        const isSelected = selectedLead?.id === lead.id;
        
        return (
          <div
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className={`
              border rounded-lg p-4 cursor-pointer transition-all duration-200
              ${isSelected 
                ? 'border-blue-500 bg-blue-50 shadow-md' 
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }
            `}
          >
            {/* Lead Header */}
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getSourceIcon(lead.source)}</span>
                  <h3 className={`font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {lead.name || 'Unknown Lead'}
                  </h3>
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                  {lead.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={14} />
                      {lead.phone}
                    </span>
                  )}
                  {lead.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail size={14} />
                      {lead.email}
                    </span>
                  )}
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(lead.ai_status || 'inactive')}`}>
                    {lead.ai_status || 'inactive'}
                  </span>
                  {lead.unread_count > 0 && (
                    <span className="px-2 py-1 bg-red-500 text-white rounded-full text-xs font-bold">
                      {lead.unread_count} new
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => toggleExpand(lead.id, e)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
                {lead.source && (
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-gray-400" />
                    <span className="text-gray-600">Source:</span>
                    <span className="font-medium">{lead.source}</span>
                  </div>
                )}
                
                {lead.last_contacted && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-gray-400" />
                    <span className="text-gray-600">Last Contact:</span>
                    <span className="font-medium">
                      {new Date(lead.last_contacted).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {lead.message_count > 0 && (
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} className="text-gray-400" />
                    <span className="text-gray-600">Messages:</span>
                    <span className="font-medium">{lead.message_count}</span>
                  </div>
                )}

                {lead.tags && lead.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {lead.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 rounded">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Custom Fields:</div>
                    {Object.entries(lead.custom_fields).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-gray-500">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LeadList;