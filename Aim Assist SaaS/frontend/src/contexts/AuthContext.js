/**
 * Authentication Context
 * Manages user authentication state, social auth, and tenant association
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, signInWithProvider } from '../config/supabase';
import apiService from '../services/apiService';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch tenant data for authenticated user
  const fetchTenantForUser = async (userId) => {
    try {
      console.log('Fetching tenant for user:', userId);
      const response = await apiService.tenants.getCurrent();
      console.log('Tenant response:', response);
      console.log('Tenant data:', response?.data);
      console.log('Tenant data stringified:', JSON.stringify(response?.data));
      
      // Handle the response structure
      if (response?.data?.tenant === null) {
        console.log('No tenant found for user - need to complete profile');
        return null;
      }
      
      // If we get just null, it means no tenant exists
      if (response?.data === null) {
        console.log('No tenant exists - need to complete profile');
        return null;
      }
      
      return response?.data?.tenant || response?.data || response;
    } catch (error) {
      console.error('Error fetching tenant:', error.response || error);
      return null;
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchTenantForUser(session.user.id).then(setTenant);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);
        
        if (event === 'SIGNED_IN' && session) {
          setUser(session.user);
          const tenantData = await fetchTenantForUser(session.user.id);
          setTenant(tenantData);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setTenant(null);
        } else if (event === 'USER_UPDATED' && session) {
          setUser(session.user);
        }
        
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Social auth methods
  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      console.log('Starting Google sign-in...');
      const result = await signInWithProvider('google');
      console.log('Google sign-in result:', result);
      // The signInWithOAuth should trigger a redirect, so code after this shouldn't run
      // But if it doesn't redirect, we need to reset loading state
      setTimeout(() => setLoading(false), 3000);
    } catch (err) {
      console.error('Google sign-in error:', err);
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      setError(null);
      await signInWithProvider('azure');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signInWithLinkedIn = async () => {
    try {
      setError(null);
      await signInWithProvider('linkedin');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signInWithApple = async () => {
    try {
      setError(null);
      await signInWithProvider('apple');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Email/password auth
  const signInWithEmail = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // Fetch tenant after successful login
      if (data.user) {
        const tenantData = await fetchTenantForUser(data.user.id);
        setTenant(tenantData);
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signUpWithEmail = async (email, password, metadata = {}) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata // Store additional user metadata
        }
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setTenant(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const resetPassword = async (email) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Create or update tenant after social auth
  const createTenantForSocialUser = async (tenantData) => {
    try {
      const response = await apiService.auth.socialSignup({
        supabaseUserId: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
        ...tenantData
      });
      
      setTenant(response.tenant);
      return response.tenant;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Refresh tenant data
  const refreshTenant = async () => {
    if (!user) return null;
    
    try {
      const tenantData = await fetchTenantForUser(user.id);
      setTenant(tenantData);
      return tenantData;
    } catch (err) {
      console.error('Failed to refresh tenant:', err);
      return null;
    }
  };

  const value = {
    user,
    tenant,
    loading,
    error,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithLinkedIn,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    createTenantForSocialUser,
    refreshTenant,
    isAuthenticated: !!user,
    needsOnboarding: user && !tenant
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;