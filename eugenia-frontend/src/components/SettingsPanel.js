// src/components/SettingsPanel.js
import React from 'react';
import { Settings } from 'lucide-react';

const SettingsPanel = (props) => {
  return (
    <div className="bg-white/95 backdrop-blur-sm border-b border-warm-200 p-6 shadow-warm-md mb-2 transition-all duration-warm ease-warm">
      <div className="container mx-auto">
        <div className="flex items-center justify-center text-warm-600">
          <Settings size={24} className="mr-2" />
          <span className="text-lg">Settings coming soon...</span>
        </div>
      </div>
    </div>
  );
};
export default SettingsPanel;