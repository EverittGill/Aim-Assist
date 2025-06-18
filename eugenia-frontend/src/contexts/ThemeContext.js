// src/contexts/ThemeContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Initialize theme from localStorage or default to light theme
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('eugenia-theme');
    return savedTheme || 'eugenia';
  });

  // Apply theme to document when it changes
  useEffect(() => {
    console.log('Applying theme:', theme);
    // Force the attribute update
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // Also set it on body as a backup
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('eugenia-theme', theme);
    console.log('Theme applied, checking:', root.getAttribute('data-theme'));
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      // Cycle through: light -> dark -> beach -> light
      let newTheme;
      if (prevTheme === 'eugenia') newTheme = 'eugenia-dark';
      else if (prevTheme === 'eugenia-dark') newTheme = 'eugenia-beach';
      else newTheme = 'eugenia';
      
      console.log('Theme changing from', prevTheme, 'to', newTheme);
      return newTheme;
    });
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === 'eugenia-dark',
    isBeach: theme === 'eugenia-beach',
    isLight: theme === 'eugenia'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};