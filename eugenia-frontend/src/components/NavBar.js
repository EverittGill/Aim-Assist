// src/components/NavBar.js
import React from 'react';
import { Brain, Settings as SettingsIcon, LogOut, User } from 'lucide-react';
import { AI_SENDER_NAME } from './constants';

const NavBar = ({ onToggleSettings, onToggleLeadsPanel, user, onLogout }) => { // Added onToggleLeadsPanel for mobile
  return (
    <nav className="navbar bg-warm-100/90 backdrop-blur-md shadow-warm-md border-b border-warm-200 sticky top-0 z-[51] px-4">
      <div className="navbar-start">
        <div className="flex items-center space-x-3">
          <Brain size={28} className="text-brand-600" />
          <span className="text-xl font-bold text-brand-800 normal-case">
            FUB {AI_SENDER_NAME} ISA
          </span>
        </div>
      </div>

      <div className="navbar-center hidden lg:flex">
        {/* Future Navigation Links Placeholder */}
      </div>

      <div className="navbar-end">
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-brand-100/50 rounded-full">
                <User size={16} className="text-brand-600" />
                <span className="text-sm text-brand-700 font-medium">{user.email}</span>
              </div>
              <button 
                onClick={onLogout}
                className="btn btn-ghost btn-circle text-warm-700 hover:text-error hover:bg-error-light/50 transition-colors duration-warm"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
          <button 
            onClick={onToggleSettings} 
            className="btn btn-ghost btn-circle text-warm-700 hover:text-brand-700 hover:bg-brand-100/50 transition-colors duration-warm"
            aria-label="Toggle Settings"
            title="Settings"
          >
            <SettingsIcon size={24} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;