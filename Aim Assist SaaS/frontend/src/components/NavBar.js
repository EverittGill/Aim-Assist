/**
 * Navigation Bar Component
 * Main navigation with user menu and theme toggle
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, tenant, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const getThemeIcon = () => {
    switch(theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'beach':
        return '🏖️';
      default:
        return '☀️';
    }
  };

  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="navbar-start">
        <div className="dropdown">
          <label tabIndex={0} className="btn btn-ghost lg:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </label>
          <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
            <li><Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link></li>
            <li><Link to="/leads" className={isActive('/leads')}>Leads</Link></li>
            <li><Link to="/analytics" className={isActive('/analytics')}>Analytics</Link></li>
            <li><Link to="/settings" className={isActive('/settings')}>Settings</Link></li>
            <li><Link to="/billing" className={isActive('/billing')}>Billing</Link></li>
          </ul>
        </div>
        <Link to="/dashboard" className="btn btn-ghost normal-case text-xl">
          <span className="text-primary font-bold">Aim Assist</span>
        </Link>
      </div>
      
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          <li><Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link></li>
          <li><Link to="/leads" className={isActive('/leads')}>Leads</Link></li>
          <li><Link to="/analytics" className={isActive('/analytics')}>Analytics</Link></li>
          <li><Link to="/settings" className={isActive('/settings')}>Settings</Link></li>
          <li><Link to="/billing" className={isActive('/billing')}>Billing</Link></li>
        </ul>
      </div>
      
      <div className="navbar-end">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="btn btn-ghost btn-circle"
          title={`Switch to ${theme === 'light' ? 'dark' : theme === 'dark' ? 'beach' : 'light'} mode`}
        >
          <span className="text-xl">{getThemeIcon()}</span>
        </button>

        {/* Notifications */}
        <button className="btn btn-ghost btn-circle">
          <div className="indicator">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="badge badge-xs badge-primary indicator-item"></span>
          </div>
        </button>

        {/* User Menu */}
        <div className="dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-circle avatar">
            <div className="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
              <span className="text-lg font-semibold">
                {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </span>
            </div>
          </label>
          <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
            <li className="menu-title">
              <span className="text-xs opacity-60">{tenant?.company_name || 'Your Account'}</span>
            </li>
            <li>
              <Link to="/settings" className="justify-between">
                Profile Settings
                <span className="badge badge-sm">Pro</span>
              </Link>
            </li>
            <li><Link to="/billing">Billing & Usage</Link></li>
            <li><Link to="/support">Support</Link></li>
            <li className="divider mt-0 mb-0"></li>
            <li><a onClick={handleSignOut}>Sign Out</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NavBar;