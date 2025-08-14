/**
 * Provides Supabase client to entire app
 * Manages authentication state
 * Handles login/logout/signup operations
 * Includes Google OAuth support
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Get Supabase config from environment
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'placeholder_anon_key';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create context
const SupabaseContext = createContext({});

// Provider component
export const SupabaseProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(null);

  useEffect(() => {
    // Check for existing session
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch tenant info when user logs in
          await fetchTenantInfo(session.user.id);
        } else {
          setTenantInfo(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchTenantInfo(session.user.id);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantInfo = async (userId) => {
    try {
      // For development/testing without real Supabase
      if (supabaseUrl === 'https://placeholder.supabase.co') {
        setTenantInfo({
          id: 'test-tenant-id',
          name: 'Test Company',
          subdomain: 'test',
          subscription_plan: 'starter',
          subscription_status: 'trial'
        });
        return;
      }

      // Fetch user's tenant info from database
      const { data, error } = await supabase
        .from('users')
        .select(`
          tenant_id,
          role,
          tenants (
            id,
            name,
            subdomain,
            subscription_plan,
            subscription_status,
            settings
          )
        `)
        .eq('auth_id', userId)
        .single();

      if (error) throw error;
      
      setTenantInfo(data?.tenants);
    } catch (error) {
      console.error('Error fetching tenant info:', error);
    }
  };

  const signUp = async ({ email, password, tenantName, firstName, lastName }) => {
    try {
      // First create the tenant
      const response = await fetch(`${process.env.REACT_APP_API_URL}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tenantName,
          subdomain: tenantName.toLowerCase().replace(/\s+/g, '-'),
          owner_email: email,
          owner_name: `${firstName} ${lastName}`
        })
      });

      if (!response.ok) throw new Error('Failed to create tenant');
      const tenant = await response.json();

      // Then create the auth user with tenant metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            tenant_id: tenant.id
          }
        }
      });

      if (error) throw error;
      return { user: data.user, tenant };
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const signIn = async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard'
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setSession(null);
      setTenantInfo(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const value = {
    supabase,
    user,
    session,
    loading,
    tenantInfo,
    signUp,
    signIn,
    signInWithGoogle,
    signOut
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
};

// Custom hook to use Supabase context
export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

export default SupabaseContext;