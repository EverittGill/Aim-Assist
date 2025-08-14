/**
 * Login UI with email/password and Google OAuth
 * Shows loading states and error messages
 * Redirects to dashboard on success
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSupabase } from '../../contexts/SupabaseContext';
import { Mail, Lock, Loader, AlertCircle } from 'lucide-react';

function LoginForm() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useSupabase();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      // Google OAuth will redirect automatically
    } catch (err) {
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  // Demo/test login for development
  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);

    try {
      // Use test credentials
      await signIn({ 
        email: 'demo@aimassist.com', 
        password: 'demo123456' 
      });
      navigate('/dashboard');
    } catch (err) {
      // If demo account doesn't exist, show message
      setError('Demo account not configured. Please use sign up to create an account.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🎯 Aim Assist
          </h1>
          <p className="text-gray-600">Multi-tenant Sales Automation</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start">
            <AlertCircle className="mr-2 mt-0.5" size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="you@company.com"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 px-4 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader className="animate-spin mr-2" size={20} />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="mr-2" width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>

          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Try Demo Account
          </button>
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center space-y-2">
          <Link 
            to="/forgot-password" 
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            Forgot your password?
          </Link>
          <div className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/signup" className="text-purple-600 hover:text-purple-700 font-medium">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginForm;