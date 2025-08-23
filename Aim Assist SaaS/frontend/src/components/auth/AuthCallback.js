/**
 * OAuth Callback Handler
 * Processes OAuth redirects from social providers
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import api from '../../services/apiService';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get error from URL params if any
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle OAuth errors
      if (error) {
        setError(errorDescription || 'Authentication failed');
        setLoading(false);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Supabase handles the OAuth callback automatically
      // Just get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        setError(sessionError.message);
        setLoading(false);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (!session) {
        setError('No session found');
        setLoading(false);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      const data = { user: session.user };

      // Check if this is a new user (social signup)
      const isNewUser = data.user.created_at === data.user.last_sign_in_at;
      
      if (isNewUser) {
        // New user - needs to complete profile
        // Store provider info in metadata for profile completion
        const metadata = {
          provider: data.user.app_metadata.provider,
          email: data.user.email,
          full_name: data.user.user_metadata.full_name || 
                     data.user.user_metadata.name ||
                     data.user.user_metadata.preferred_username,
          avatar_url: data.user.user_metadata.avatar_url || 
                     data.user.user_metadata.picture
        };
        
        // Call backend to create initial tenant record
        try {
          await api.auth.socialSignup({
            user_id: data.user.id,
            email: data.user.email,
            metadata
          });
        } catch (apiError) {
          console.error('Failed to create tenant:', apiError);
          // Continue anyway - they can complete profile
        }
        
        // Redirect to profile completion
        navigate('/onboarding/complete-profile', {
          state: { 
            isNewUser: true,
            metadata 
          }
        });
      } else {
        // Existing user - check if they have a complete profile
        try {
          const tenantData = await api.tenants.getCurrent();
          
          if (!tenantData || !tenantData.company_name) {
            // Profile incomplete
            navigate('/onboarding/complete-profile');
          } else {
            // Profile complete - go to dashboard
            navigate('/dashboard');
          }
        } catch (error) {
          console.error('Failed to fetch tenant:', error);
          // Assume profile needs completion
          navigate('/onboarding/complete-profile');
        }
      }
    } catch (error) {
      console.error('Callback error:', error);
      setError('An unexpected error occurred');
      setLoading(false);
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="card bg-base-100 shadow-xl max-w-md w-full">
        <div className="card-body text-center">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold">Completing sign in...</h2>
              <p className="text-base-content/60 mt-2">Please wait while we set up your account</p>
            </>
          ) : error ? (
            <>
              <div className="text-error text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold text-error">Authentication Failed</h2>
              <p className="text-base-content/60 mt-2">{error}</p>
              <p className="text-sm text-base-content/40 mt-4">Redirecting to login...</p>
            </>
          ) : (
            <>
              <div className="text-success text-4xl mb-4">✓</div>
              <h2 className="text-xl font-semibold">Success!</h2>
              <p className="text-base-content/60 mt-2">Redirecting to your dashboard...</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;