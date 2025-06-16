// src/components/LoginForm.js
import React, { useState } from 'react';
import { Mail, Lock, LogIn, AlertTriangle } from 'lucide-react';

const LoginForm = ({ onLogin, isLoading, error }) => {
  const [credentials, setCredentials] = useState({
    email: 'admin@eugenia.app',
    password: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(credentials.email, credentials.password);
  };

  const handleInputChange = (field, value) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 flex items-center justify-center p-4" data-theme="eugenia">
      <div className="w-full max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-warm-lg border border-warm-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-brand-800 mb-2">Eugenia ISA</h1>
            <p className="text-warm-600">AI-Powered Inside Sales Agent</p>
          </div>

          {error && (
            <div className="alert alert-error bg-error-light text-error-dark border-error mb-6">
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-warm-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-warm-500" />
                <input
                  type="email"
                  id="email"
                  value={credentials.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="input input-bordered w-full pl-10 bg-white border-warm-300 focus:border-brand-500"
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-warm-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-warm-500" />
                <input
                  type="password"
                  id="password"
                  value={credentials.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="input input-bordered w-full pl-10 bg-white border-warm-300 focus:border-brand-500"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !credentials.email || !credentials.password}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Signing In...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-warm-600">
            <p>Demo credentials: admin@eugenia.app / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;