import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeTest = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div className="fixed bottom-4 left-4 p-4 bg-base-200 rounded-lg shadow-lg z-50">
      <h3 className="text-lg font-bold mb-2">Theme Test</h3>
      <p className="text-sm mb-2">Current theme: <span className="font-mono">{theme}</span></p>
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="w-16 h-8 bg-primary rounded"></div>
          <span className="text-sm">Primary</span>
        </div>
        <div className="flex gap-2">
          <div className="w-16 h-8 bg-secondary rounded"></div>
          <span className="text-sm">Secondary</span>
        </div>
        <div className="flex gap-2">
          <div className="w-16 h-8 bg-base-100 border rounded"></div>
          <span className="text-sm">Base-100</span>
        </div>
        <div className="flex gap-2">
          <div className="w-16 h-8 bg-base-content rounded"></div>
          <span className="text-sm">Base-content</span>
        </div>
      </div>
      <button 
        onClick={toggleTheme}
        className="btn btn-primary btn-sm mt-4"
      >
        Toggle Theme
      </button>
    </div>
  );
};

export default ThemeTest;