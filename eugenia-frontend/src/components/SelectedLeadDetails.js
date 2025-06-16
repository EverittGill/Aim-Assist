// src/components/SelectedLeadDetails.js
import React from 'react';
import { Mail, Phone, ExternalLink, Trash2, Tag, Pause, Play, Bot } from 'lucide-react';

const SelectedLeadDetails = ({ lead, onDeleteLead, onToggleAIPause, isActionInProgress }) => {
  // Determine AI status based on lead status or tags
  const isAIPaused = lead.status?.toLowerCase().includes('paused') || 
                     lead.tags?.some(tag => tag.toLowerCase().includes('paused')) ||
                     lead.aiStatus === 'paused';
  
  const aiStatus = isAIPaused ? 'Paused' : 'Active'; 
  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        <div> 
          <h2 className="text-2xl lg:text-3xl font-bold text-brand-800">{lead.name}</h2> 
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-1 text-warm-700 text-sm"> 
            {lead.email && <span className="flex items-center"><Mail size={14} className="mr-1.5 text-brand-600" /> {lead.email}</span>} 
            {lead.phone && <span className="flex items-center mt-1 sm:mt-0"><Phone size={14} className="mr-1.5 text-brand-600" /> {lead.phone}</span>} 
          </div> 
        </div>
        <div className="flex gap-2 items-center self-start sm:self-center mt-2 sm:mt-0"> 
          <a href={lead.fubLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-warm-600 hover:bg-warm-700 text-white text-xs sm:text-sm rounded-md shadow-warm-sm flex items-center transition-colors duration-warm"> Open in FUB <ExternalLink size={14} className="ml-1.5" /> </a> 
          <button onClick={() => onDeleteLead(lead.id, lead.name)} disabled={isActionInProgress} className="p-2 rounded-md bg-error hover:bg-error-dark disabled:bg-warm-400 text-white transition-colors duration-warm" title="Delete Lead from FUB"><Trash2 size={16}/></button> 
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm"> 
        <div className="flex flex-wrap items-center gap-3">
          <p><strong className="text-warm-600">Status:</strong> <span className="px-2 py-0.5 bg-brand-500 text-white rounded-full text-xs font-medium">{lead.status}</span></p>
          {lead.hasValidPhone === false && (
            <div className="px-2 py-1 bg-warning/20 border border-warning rounded-md">
              <span className="text-warning-dark text-xs font-medium">⚠️ No Valid Phone Number</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <strong className="text-warm-600">AI Status:</strong> 
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