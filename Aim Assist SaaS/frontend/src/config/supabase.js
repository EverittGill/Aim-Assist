/**
 * Supabase Client Configuration
 * Handles authentication and database operations
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://qjuajqqchqxjxntofdoz.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdWFqcXFjaHF4anhudG9mZG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0Mzk3OTQsImV4cCI6MjA3MTAxNTc5NH0.PsO740pUmFaVn-K-QeNxR2jupX3nlhopASe7iqq8gDo';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'aim-assist-auth'
  }
});

// OAuth provider configurations
export const authProviders = {
  google: {
    name: 'Google',
    icon: '/icons/google.svg',
    color: 'bg-white hover:bg-gray-50'
  },
  azure: {
    name: 'Microsoft',
    icon: '/icons/microsoft.svg',
    color: 'bg-blue-600 hover:bg-blue-700 text-white'
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '/icons/linkedin.svg',
    color: 'bg-blue-700 hover:bg-blue-800 text-white'
  },
  apple: {
    name: 'Apple',
    icon: '/icons/apple.svg',
    color: 'bg-black hover:bg-gray-900 text-white'
  }
};

// Helper functions for social auth
export const signInWithProvider = async (provider) => {
  console.log(`Attempting OAuth sign-in with ${provider}`);
  console.log('Redirect URL:', `${window.location.origin}/auth/callback`);
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: provider === 'azure' ? {
        prompt: 'select_account'
      } : {}
    }
  });
  
  console.log('OAuth response:', { data, error });
  
  if (error) {
    console.error(`Error signing in with ${provider}:`, error);
    throw error;
  }
  
  // Supabase should return a URL to redirect to
  if (data?.url) {
    console.log('Redirecting to:', data.url);
    window.location.href = data.url;
  } else {
    console.warn('No redirect URL received from Supabase');
  }
  
  return data;
};

export default supabase;