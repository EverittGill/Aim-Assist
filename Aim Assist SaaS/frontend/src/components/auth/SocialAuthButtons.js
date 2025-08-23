/**
 * Social Authentication Buttons
 * Provides sign-in/sign-up buttons for OAuth providers
 */

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const SocialAuthButtons = ({ mode = 'signup' }) => {
  const { 
    signInWithGoogle, 
    signInWithMicrosoft, 
    signInWithLinkedIn,
    signInWithApple,
    loading 
  } = useAuth();
  
  const [currentProvider, setCurrentProvider] = React.useState(null);

  const buttonText = mode === 'signup' ? 'Sign up with' : 'Sign in with';

  return (
    <div className="space-y-3">
      {/* Google */}
      <button
        onClick={async () => {
          setCurrentProvider('google');
          try {
            await signInWithGoogle();
          } finally {
            setCurrentProvider(null);
          }
        }}
        disabled={loading}
        className="btn btn-outline w-full flex items-center justify-center gap-3 hover:bg-gray-50"
      >
        {loading && currentProvider === 'google' ? (
          <span className="loading loading-spinner loading-sm"></span>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        <span>
          {loading && currentProvider === 'google' 
            ? 'Redirecting to Google...' 
            : `${buttonText} Google`
          }
        </span>
      </button>

      {/* Microsoft */}
      <button
        onClick={signInWithMicrosoft}
        disabled={loading}
        className="btn btn-outline w-full flex items-center justify-center gap-3 hover:bg-gray-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#F25022" d="M1 1h10v10H1z"/>
          <path fill="#00A4EF" d="M13 1h10v10H13z"/>
          <path fill="#7FBA00" d="M1 13h10v10H1z"/>
          <path fill="#FFB900" d="M13 13h10v10H13z"/>
        </svg>
        <span>{buttonText} Microsoft</span>
      </button>

      {/* LinkedIn */}
      <button
        onClick={signInWithLinkedIn}
        disabled={loading}
        className="btn btn-outline w-full flex items-center justify-center gap-3 hover:bg-gray-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0077B5">
          <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
        </svg>
        <span>{buttonText} LinkedIn</span>
      </button>

      {/* Apple - Only show on Apple devices */}
      {(navigator.platform?.includes('Mac') || navigator.platform?.includes('iPhone') || navigator.platform?.includes('iPad')) && (
        <button
          onClick={signInWithApple}
          disabled={loading}
          className="btn btn-neutral w-full flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          <span>{buttonText} Apple</span>
        </button>
      )}
    </div>
  );
};

export default SocialAuthButtons;