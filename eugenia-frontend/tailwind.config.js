// eugenia-frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", 
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors (warm tan/caramel)
        brand: {
          50: '#FBF8F3',
          100: '#F2EDE3',
          200: '#E8DDD0', 
          300: '#DCCABA',
          400: '#D0B5A3',
          500: '#C4A08B', // main brand color
          600: '#B8936F',
          700: '#A68660',
          800: '#8F7451',
          900: '#756142',
        },
        // Accent colors (warm bronze/earth tones)
        accent: {
          50: '#F9F6F1',
          100: '#F0E8DA',
          200: '#E6D6C3',
          300: '#DCC4AD', 
          400: '#D2B397',
          500: '#C8A180', // main accent
          600: '#BE8F6A',
          700: '#B47D54',
          800: '#AA6B3E',
          900: '#A05928',
        },
        // Warm grays
        warm: {
          50: '#FDFCFA',
          100: '#F8F6F2',
          200: '#F0EDEA',
          300: '#E7E3DF',
          400: '#DDD8D2',
          500: '#C9C3BB',
          600: '#A8A19A',
          700: '#73706A',
          800: '#4A473F',
          900: '#2A271F',
        },
        // Status colors with warm undertones
        success: {
          light: '#F0F9E8',
          DEFAULT: '#8BC34A',
          dark: '#689F38',
        },
        warning: {
          light: '#FFF8E1',
          DEFAULT: '#FF9800', 
          dark: '#F57C00',
        },
        error: {
          light: '#FFEBEE',
          DEFAULT: '#F44336',
          dark: '#D32F2F',
        },
        info: {
          light: '#E3F2FD',
          DEFAULT: '#2196F3',
          dark: '#1976D2',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['Monaco', 'Courier', 'monospace'],
      },
      boxShadow: {
        'warm-sm': '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
        'warm-md': '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
        'warm-lg': '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
        'warm-xl': '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
      },
      transitionDuration: {
        'warm': '200ms',
      },
      transitionTimingFunction: {
        'warm': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        eugenia: {
          "primary": "#C4A08B",        // brand-500
          "primary-content": "#FDFCFA", // warm-50
          "secondary": "#C8A180",      // accent-500  
          "secondary-content": "#FDFCFA",
          "accent": "#BE8F6A",         // accent-600
          "accent-content": "#FDFCFA",
          "neutral": "#73706A",        // warm-700
          "neutral-content": "#FDFCFA",
          "base-100": "#FDFCFA",       // warm-50 (main background)
          "base-200": "#F8F6F2",       // warm-100
          "base-300": "#F0EDEA",       // warm-200
          "base-content": "#2A271F",   // warm-900 (main text)
          "info": "#2196F3",
          "success": "#8BC34A", 
          "warning": "#FF9800",
          "error": "#F44336",
        },
      },
    ],
  },
}