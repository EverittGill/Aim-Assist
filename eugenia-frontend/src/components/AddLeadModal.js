// src/components/AddLeadModal.js
import React from 'react';
import { RefreshCw } from 'lucide-react';

const AddLeadModal = ({ showModal, onClose, newLeadData, onInputChange, onSubmit, isActionInProgress }) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
        <h3 className="text-xl font-semibold text-sky-300 mb-4">Add New Lead (via Backend)</h3>
        <div className="space-y-3">
          <div><label htmlFor="newLeadName" className="text-sm text-slate-300">Full Name:</label><input type="text" id="newLeadName" name="name" value={newLeadData.name} onChange={onInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
          <div><label htmlFor="newLeadEmail" className="text-sm text-slate-300">Email:</label><input type="email" id="newLeadEmail" name="email" value={newLeadData.email} onChange={onInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
          <div><label htmlFor="newLeadPhone" className="text-sm text-slate-300">Phone (E.164):</label><input type="tel" id="newLeadPhone" name="phone" value={newLeadData.phone} onChange={onInputChange} className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600"/></div>
          <div><label htmlFor="newLeadNotes" className="text-sm text-slate-300">Notes:</label><textarea id="newLeadNotes" name="notes" value={newLeadData.notes} onChange={onInputChange} rows="3" className="w-full mt-1 p-2 rounded bg-slate-700 border-slate-600 resize-none"></textarea></div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={isActionInProgress} className="px-4 py-2 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
          <button onClick={onSubmit} disabled={isActionInProgress || !newLeadData.name || !newLeadData.email} className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-600 flex items-center"> 
            {isActionInProgress && <RefreshCw size={18} className="animate-spin mr-2"/>} Create Lead 
          </button>
        </div>
      </div>
    </div>
  );
};
export default AddLeadModal;