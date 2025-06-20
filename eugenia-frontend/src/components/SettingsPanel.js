// src/components/SettingsPanel.js
import React, { useState, useEffect } from 'react';
import { Settings, Zap, Building2, AlertCircle } from 'lucide-react';

const SettingsPanel = ({ userAgencyName, setUserAgencyName }) => {
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Load dev mode state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('eugenia_dev_mode_470');
    setDevModeEnabled(stored === 'true');
  }, []);

  const handleToggleDevMode = async () => {
    setIsUpdating(true);
    try {
      const newState = !devModeEnabled;
      
      // Update backend about dev mode state for lead 470
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/dev-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('eugenia_auth_token')}`
        },
        body: JSON.stringify({
          leadId: '470',
          enabled: newState
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update dev mode');
      }

      // Update local state
      setDevModeEnabled(newState);
      localStorage.setItem('eugenia_dev_mode_470', newState.toString());
      
      console.log(`🛠️ Dev Mode ${newState ? 'ENABLED' : 'DISABLED'} for Test Lead 470`);
    } catch (error) {
      console.error('Error toggling dev mode:', error);
      alert('Failed to update dev mode settings');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-base-100/95 backdrop-blur-sm border-b border-base-300 p-6 shadow-warm-md mb-2 transition-all duration-warm ease-warm">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center mb-6">
          <Settings size={24} className="mr-2 text-primary" />
          <h2 className="text-xl font-semibold">Settings</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Agency Name Setting */}
          <div className="card bg-base-200/50 shadow-xl">
            <div className="card-body">
              <div className="flex items-center mb-2">
                <Building2 size={20} className="mr-2 text-primary" />
                <h3 className="card-title text-lg">Agency Name</h3>
              </div>
              <input
                type="text"
                value={userAgencyName}
                onChange={(e) => setUserAgencyName(e.target.value)}
                placeholder="Your Awesome Realty"
                className="input input-bordered w-full"
              />
              <p className="text-sm text-base-content/70 mt-2">
                This name will be used in AI-generated messages
              </p>
            </div>
          </div>

          {/* Dev Mode Toggle */}
          <div className="card bg-base-200/50 shadow-xl">
            <div className="card-body">
              <div className="flex items-center mb-2">
                <Zap size={20} className="mr-2 text-warning" />
                <h3 className="card-title text-lg">Development Mode</h3>
              </div>
              
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text">Enable for Test Lead (ID: 470)</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-warning"
                    checked={devModeEnabled}
                    onChange={handleToggleDevMode}
                    disabled={isUpdating}
                  />
                </label>
              </div>
              
              <div className={`alert ${devModeEnabled ? 'alert-warning' : 'alert-info'} mt-3`}>
                <AlertCircle size={16} />
                <div className="text-sm">
                  {devModeEnabled ? (
                    <>
                      <strong>Dev Mode Active:</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>No 3-message limits</li>
                        <li>No 2-hour pauses</li>
                        <li>Full SMS sending enabled</li>
                        <li>All restrictions removed</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <strong>Production Mode:</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>3-message limit in 2 hours</li>
                        <li>Auto-pause after engagement</li>
                        <li>SMS notifications to agent</li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;