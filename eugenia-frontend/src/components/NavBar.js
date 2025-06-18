// src/components/NavBar.js
import React from 'react';
import { Search, Settings as SettingsIcon, LogOut, User } from 'lucide-react';
import { AI_SENDER_NAME } from './constants';

const NavBar = ({ onToggleSettings, onToggleLeadsPanel, user, onLogout, searchQuery, onSearchChange }) => {
  return (
    <nav className="navbar bg-warm-100/90 backdrop-blur-md shadow-warm-md border-b border-warm-200 md:sticky md:top-0 z-[51] px-6 py-3 min-h-[4rem]">
      <div className="w-full flex items-center justify-between">
        {/* Left side - Aim Assist title and future nav items */}
        <div className="flex items-center gap-8">
          <span className="text-2xl font-bold text-brand-800 normal-case tracking-tight">
            Aim Assist
          </span>
          {/* Space for future navigation items */}
        </div>

        {/* Right side - All nav components */}
        <div className="flex items-center gap-4">
          {/* Search field */}
          <div className="form-control w-full max-w-xs relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads..."
              className="input input-bordered input-sm w-full bg-white/90 focus:bg-white pl-10 pr-3 h-9"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          
          {user && (
            <>
              <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-brand-100/50 rounded-full">
                <User size={16} className="text-brand-600" />
                <span className="text-sm text-brand-700 font-medium">{user.email}</span>
              </div>
              <button 
                onClick={onLogout}
                className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-warm-700 hover:text-error hover:bg-error-light/50 transition-colors duration-warm"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </>
          )}
          
          {/* Settings button */}
          <button 
            onClick={onToggleSettings} 
            className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-warm-700 hover:text-brand-700 hover:bg-brand-100/50 transition-colors duration-warm"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;