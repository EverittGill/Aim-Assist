// Theme colors and design system for Eugenia ISA
export const theme = {
  // Warm tan and earth tone palette
  colors: {
    // Primary warm tan/caramel
    brand: [
      '#FBF8F3', // 0 - lightest cream
      '#F2EDE3', 
      '#E8DDD0',
      '#DCCABA',
      '#D0B5A3',
      '#C4A08B', // 5 - main tan color
      '#B8936F', // 6 - deeper tan
      '#A68660',
      '#8F7451',
      '#756142', // 9 - darkest
    ],
    // Warm earth tones for accents
    accent: [
      '#F9F6F1', // 0 - lightest
      '#F0E8DA',
      '#E6D6C3',
      '#DCC4AD',
      '#D2B397',
      '#C8A180', // 5 - warm bronze
      '#BE8F6A',
      '#B47D54',
      '#AA6B3E',
      '#A05928', // 9 - darkest bronze
    ],
    // Soft warm grays
    gray: [
      '#FDFCFA', // 0 - warm white background
      '#F8F6F2',
      '#F0EDEA',
      '#E7E3DF',
      '#DDD8D2',
      '#C9C3BB',
      '#A8A19A',
      '#73706A',
      '#4A473F',
      '#2A271F', // 9 - warm black
    ],
    // Status colors with warm undertones
    success: {
      light: '#F0F9E8',
      main: '#8BC34A',
      dark: '#689F38',
    },
    warning: {
      light: '#FFF8E1', 
      main: '#FF9800',
      dark: '#F57C00',
    },
    error: {
      light: '#FFEBEE',
      main: '#F44336', 
      dark: '#D32F2F',
    },
    info: {
      light: '#E3F2FD',
      main: '#2196F3',
      dark: '#1976D2',
    },
  },
  
  // Spacing scale
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px  
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    xxl: '3rem',     // 48px
  },
  
  // Border radius
  radius: {
    xs: '0.125rem',  // 2px
    sm: '0.25rem',   // 4px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
    full: '9999px',  // fully rounded
  },
  
  // Shadows
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
  },
  
  // Typography
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyMono: 'Monaco, Courier, monospace',
    fontSizes: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      md: '1rem',      // 16px
      lg: '1.125rem',  // 18px
      xl: '1.25rem',   // 20px
      xxl: '1.5rem',   // 24px
      xxxl: '2rem',    // 32px
    },
    fontWeights: {
      normal: '400',
      medium: '500', 
      semibold: '600',
      bold: '700',
    },
  },
  
  // Transitions
  transitions: {
    duration: '200ms',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// CSS custom properties for use in Tailwind config
export const cssVariables = {
  '--color-brand-50': theme.colors.brand[0],
  '--color-brand-100': theme.colors.brand[1], 
  '--color-brand-200': theme.colors.brand[2],
  '--color-brand-300': theme.colors.brand[3],
  '--color-brand-400': theme.colors.brand[4],
  '--color-brand-500': theme.colors.brand[5],
  '--color-brand-600': theme.colors.brand[6],
  '--color-brand-700': theme.colors.brand[7],
  '--color-brand-800': theme.colors.brand[8],
  '--color-brand-900': theme.colors.brand[9],
  
  '--color-accent-50': theme.colors.accent[0],
  '--color-accent-100': theme.colors.accent[1],
  '--color-accent-200': theme.colors.accent[2], 
  '--color-accent-300': theme.colors.accent[3],
  '--color-accent-400': theme.colors.accent[4],
  '--color-accent-500': theme.colors.accent[5],
  '--color-accent-600': theme.colors.accent[6],
  '--color-accent-700': theme.colors.accent[7],
  '--color-accent-800': theme.colors.accent[8],
  '--color-accent-900': theme.colors.accent[9],
  
  '--color-warm-50': theme.colors.gray[0],
  '--color-warm-100': theme.colors.gray[1],
  '--color-warm-200': theme.colors.gray[2],
  '--color-warm-300': theme.colors.gray[3],
  '--color-warm-400': theme.colors.gray[4],
  '--color-warm-500': theme.colors.gray[5],
  '--color-warm-600': theme.colors.gray[6],
  '--color-warm-700': theme.colors.gray[7],
  '--color-warm-800': theme.colors.gray[8],
  '--color-warm-900': theme.colors.gray[9],
};

export default theme;