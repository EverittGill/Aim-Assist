// src/components/SettingsPanel.js
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { AI_SENDER_NAME } from './constants'; 

const SettingsPanel = (props) => {
  const {
    userAgencyName, setUserAgencyName,
  } = props;

  return (
    <div className="bg-white/95 backdrop-blur-sm border-b border-warm-200 p-4 shadow-warm-md mb-2 transition-all duration-warm ease-warm">
      <div className="container mx-auto">
        <h2 className="text-xl font-semibold text-brand-800 mb-4">Settings (AI Persona: {AI_SENDER_NAME})</h2>
        
        <div className="alert alert-info bg-info-light border border-info text-info-dark shadow-warm-sm mb-4 text-xs">
          <div>
            <AlertTriangle size={20} className="mr-2" />
            <span>
              <strong>Backend Configuration:</strong> All API Keys including Gemini, FUB, Twilio, and Airtable must be configured directly in your backend server's <code className="bg-warm-100 px-1 rounded">.env</code> file for security.
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {/* Agency Name */}
          <div> 
            <label htmlFor="userAgencyName" className="label pb-1">
              <span className="label-text text-warm-700">Your Agency Name:</span>
            </label> 
            <input 
              type="text" id="userAgencyName" value={userAgencyName} 
              onChange={(e) => setUserAgencyName(e.target.value)} 
              placeholder="Agency Name" 
              className="input input-bordered input-sm w-full bg-white border-warm-300 focus:border-brand-500 text-warm-900"/> 
             <p className="text-xs text-warm-600 mt-1">Used in AI prompts to personalize messages.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SettingsPanel;