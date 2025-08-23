/**
 * Login Page
 * Handles user authentication with social and email options
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SocialAuthButtons from '../components/auth/SocialAuthButtons';

const Login = () => {
  const navigate = useNavigate();
  const { signInWithEmail, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      
      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
      
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">Aim Assist</h1>
          <p className="text-base-content/70 mt-2">AI-Powered Real Estate Lead Management</p>
        </div>

        {/* Login Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-6">Welcome Back</h2>

            {/* Error Alert */}
            {(error || formError) && (
              <div className="alert alert-error mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error || formError}</span>
              </div>
            )}

            {/* Social Auth */}
            <div className="mb-6">
              <SocialAuthButtons mode="signin" />
            </div>

            {/* Divider */}
            <div className="divider">OR</div>

            {/* Email Login Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Email</span>
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="input input-bordered"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Password</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="input input-bordered"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="label-text">Remember me for 7 days</span>
                </label>
              </div>

              <button
                type="submit"
                className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {/* Links */}
            <div className="text-center mt-6 space-y-2">
              <Link to="/forgot-password" className="link link-primary text-sm">
                Forgot your password?
              </Link>
              <div className="text-sm">
                Don't have an account?{' '}
                <Link to="/signup" className="link link-primary font-semibold">
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-base-content/60">
          <p>© 2025 Aim Assist. All rights reserved.</p>
          <div className="mt-2 space-x-4">
            <Link to="/privacy" className="link">Privacy</Link>
            <Link to="/terms" className="link">Terms</Link>
            <Link to="/support" className="link">Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;