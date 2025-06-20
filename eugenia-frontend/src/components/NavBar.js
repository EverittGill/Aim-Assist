// src/components/NavBar.js
import React from 'react';
import { Search, Settings as SettingsIcon, LogOut, User, Sun, Moon, Waves, FileText } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const NavBar = ({ onToggleSettings, onToggleLeadsPanel, user, onLogout, searchQuery, onSearchChange, onTogglePromptEditor }) => {
  const { toggleTheme, isDark, isBeach } = useTheme();
  
  const getThemeIcon = () => {
    if (isDark) return <Sun size={20} />;
    if (isBeach) return <Moon size={20} />;
    return <Waves size={20} />;
  };

  const getThemeLabel = () => {
    if (isDark) return "Switch to beach mode";
    if (isBeach) return "Switch to light mode";
    return "Switch to dark mode";
  };

  return (
    <nav className="navbar bg-base-200/90 backdrop-blur-md shadow-warm-md border-b border-base-300 md:sticky md:top-0 z-[51] px-6 py-3 min-h-[4rem]">
      <div className="w-full flex items-center justify-between">
        {/* Left side - Aim Assist title and future nav items */}
        <div className="flex items-center gap-8">
          <span className="text-2xl font-bold text-primary normal-case tracking-tight">
            Aim Assist
          </span>
          {/* Space for future navigation items */}
        </div>

        {/* Right side - All nav components */}
        <div className="flex items-center gap-4">
          {/* Search field */}
          <div className="form-control w-full max-w-xs relative">
            <Search size={16} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-base-content/50 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search leads..."
              className="input input-bordered input-sm w-full bg-base-100/90 focus:bg-base-100 pl-9 pr-3 h-9"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          
          {user && (
            <>
              <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-primary/20 rounded-full">
                <User size={16} className="text-primary" />
                <span className="text-sm text-primary font-medium">{user.email}</span>
              </div>
              <button 
                onClick={onLogout}
                className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-base-content hover:text-error hover:bg-error/20 transition-colors duration-warm"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </>
          )}
          
          {/* Prompt Editor button */}
          <button 
            onClick={onTogglePromptEditor}
            className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-base-content hover:text-primary hover:bg-primary/20 transition-colors duration-warm"
            aria-label="Edit Prompts"
            title="Edit AI Prompts"
          >
            <FileText size={20} />
          </button>
          
          {/* Theme toggle */}
          <button 
            onClick={toggleTheme}
            className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-base-content hover:text-primary hover:bg-primary/20 transition-colors duration-warm"
            aria-label={getThemeLabel()}
            title={getThemeLabel()}
          >
            {getThemeIcon()}
          </button>
          
          {/* Settings button */}
          <button 
            onClick={onToggleSettings} 
            className="btn btn-ghost btn-circle btn-sm w-9 h-9 text-base-content hover:text-primary hover:bg-primary/20 transition-colors duration-warm"
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