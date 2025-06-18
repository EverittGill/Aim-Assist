// src/components/SelectedLeadDetails.js
import React from 'react';
import { Mail, Phone, ExternalLink, Trash2, Tag, Pause, Play, Bot } from 'lucide-react';

const SelectedLeadDetails = ({ lead, onDeleteLead, onToggleAIPause, isActionInProgress }) => {
  // Determine AI status based on lead status or tags
  const isAIPaused = lead.status?.toLowerCase().includes('paused') || 
                     lead.tags?.some(tag => tag.toLowerCase().includes('paused')) ||
                     lead.aiStatus === 'paused';
  
  const aiStatus = isAIPaused ? 'Paused' : 'Active';
  
  // Use the ylopoStarsLink directly from the lead object
  const ylopoStarsLink = lead.ylopoStarsLink; 
  return (
    <div>
      <div className="flex flex-col gap-3">
        <div> 
          <h2 className="text-xl font-bold text-brand-800">{lead.name}</h2> 
          <div className="flex flex-col mt-2 text-warm-700 text-sm space-y-1"> 
            {lead.email && <span className="flex items-center"><Mail size={14} className="mr-1.5 text-brand-600" /> <span className="truncate">{lead.email}</span></span>} 
            {lead.phone && <span className="flex items-center"><Phone size={14} className="mr-1.5 text-brand-600" /> {lead.phone}</span>} 
          </div> 
        </div>
        <div className="flex flex-col gap-2"> 
          <a href={lead.fubLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-warm-600 hover:bg-warm-700 text-white text-xs rounded-md shadow-warm-sm flex items-center transition-colors duration-warm w-full justify-center"> Open in FUB <ExternalLink size={12} className="ml-1.5" /> </a>
          {ylopoStarsLink && (
            <a href={ylopoStarsLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs rounded-md shadow-warm-sm flex items-center transition-colors duration-warm w-full justify-center"> Open in Ylopo Stars <ExternalLink size={12} className="ml-1.5" /> </a>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm"> 
        <div className="flex flex-col gap-2">
          <p className="flex items-center justify-between"><strong className="text-warm-600">Status:</strong> <span className="px-2 py-0.5 bg-brand-500 text-white rounded-full text-xs font-medium">{lead.status}</span></p>
          {lead.hasValidPhone === false && (
            <div className="px-2 py-1 bg-warning/20 border border-warning rounded-md">
              <span className="text-warning-dark text-xs font-medium">⚠️ No Valid Phone Number</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <strong className="text-warm-600">AI Status:</strong> 
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center ${isAIPaused ? 'bg-warning text-white' : 'bg-success text-white'}`}>
                <Bot size={10} className="mr-1" />
                {aiStatus}
              </span>
              <button 
                onClick={() => onToggleAIPause(lead.id, !isAIPaused)} 
                disabled={isActionInProgress}
                className={`p-1 rounded-md transition-colors duration-warm ${isAIPaused ? 'bg-success hover:bg-success-dark text-white' : 'bg-warning hover:bg-warning-dark text-white'} disabled:bg-warm-400`}
                title={isAIPaused ? 'Resume AI Engagement' : 'Pause AI Engagement'}
              >
                {isAIPaused ? <Play size={12} /> : <Pause size={12} />}
              </button>
            </div>
          </div>
        </div>
        {lead.source && <p><strong className="text-warm-600">Source:</strong> <span className="text-warm-800">{lead.source}</span></p>} 
        {lead.lastContacted && <p><strong className="text-warm-600">Last Contacted:</strong> <span className="text-warm-800">{new Date(lead.lastContacted).toLocaleString()}</span></p>} 
        {lead.tags && lead.tags.length > 0 && ( 
          <div className="mt-1"> 
            <strong className="text-warm-600">Tags:</strong> 
            <div className="flex flex-wrap gap-1.5 mt-0.5"> 
              {lead.tags.map(tag => ( <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-warm-600 text-white flex items-center"> <Tag size={10} className="mr-1 opacity-70"/>{tag} </span> ))} 
            </div> 
          </div> 
        )} 
        {lead.notes && <p className="mt-2"><strong className="text-warm-600">Notes:</strong> <span className="italic text-warm-800 whitespace-pre-wrap">{lead.notes}</span></p>} 
      </div>
    </div>
  );
};
export default SelectedLeadDetails;