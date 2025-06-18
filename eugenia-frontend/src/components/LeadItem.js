// src/components/LeadItem.js
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Trash2 } from 'lucide-react';

const LeadItem = ({ lead, onSelectLead, selectedLeadId, onDeleteLead, isActionInProgress }) => { 
  const [isExpanded, setIsExpanded] = useState(false); 
  const isSelected = lead.id === selectedLeadId;

  return (
    <div className={`p-3 rounded-lg shadow-warm-sm cursor-pointer transition-all duration-warm ease-warm border ${isSelected ? 'bg-brand-500/90 border-brand-600 ring-2 ring-brand-400 shadow-warm-md' : 'bg-white/80 border-warm-200 hover:bg-brand-50 hover:border-brand-300'}`} onClick={() => onSelectLead(lead)}>
      <div className="flex justify-between items-center">
        <div> 
          <h3 className={`text-md font-semibold ${isSelected ? 'text-white' : 'text-brand-800'}`}>{lead.name}</h3> 
          <p className={`text-xs ${isSelected ? 'text-brand-100' : 'text-warm-600'}`}>{lead.email || 'No email'}</p> 
          <p className={`text-xs mt-0.5 ${isSelected ? 'text-brand-200' : 'text-warm-700'}`}>Status: <span className="font-medium">{lead.status}</span></p> 
        </div>
        <div className="flex items-center gap-1"> 
          <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className={`p-1 rounded hover:bg-warm-200/30 ${isSelected ? 'text-brand-100' : 'text-warm-600'}`} aria-label={isExpanded ? "Collapse" : "Expand"}> {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />} </button> 
        </div>
      </div>
      {isExpanded && ( 
        <div className={`mt-2 pt-2 border-t ${isSelected ? 'border-brand-400/50' : 'border-warm-300/50'} text-xs space-y-1`}> 
          {lead.phone && <p className={`${isSelected ? 'text-brand-100' : 'text-warm-700'}`}><strong>Phone:</strong> {lead.phone}</p>} 
          {lead.source && <p className={`${isSelected ? 'text-brand-100' : 'text-warm-700'}`}><strong>Source:</strong> {lead.source}</p>} 
          {lead.lastContacted && <p className={`${isSelected ? 'text-brand-100' : 'text-warm-700'}`}><strong>Last Contact:</strong> {new Date(lead.lastContacted).toLocaleDateString()}</p>} 
          {lead.tags && lead.tags.length > 0 && ( 
            <div className="flex flex-wrap gap-1 mt-1"> 
              {lead.tags.slice(0, 5).map(tag => ( <span key={tag} className={`px-1.5 py-0.5 rounded-full text-xs ${isSelected ? 'bg-brand-600 text-white' : 'bg-warm-600 text-white'}`}>{tag}</span> ))} 
            </div> 
          )} 
          {lead.notes && <p className={`mt-1 italic ${isSelected ? 'text-brand-200' : 'text-warm-600'}`}>Notes: {lead.notes.substring(0,70)}${lead.notes.length > 70 ? '...' : ''}</p>} 
          <a href={lead.fubLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`mt-1 inline-flex items-center ${isSelected ? 'text-brand-200 hover:text-white' : 'text-brand-600 hover:text-brand-700'}`}> View in FUB <ExternalLink size={12} className="ml-1" /> </a> 
        </div> 
      )}
    </div>
  );
};
export default LeadItem;