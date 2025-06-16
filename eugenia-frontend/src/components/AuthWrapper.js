// src/components/AuthWrapper.js
import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/authService';
import LoginForm from './LoginForm';

const AuthWrapper = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkAuthStatus();
    // Start automatic token refresh
    AuthService.startTokenRefresh();
  }, []);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    
    if (AuthService.isAuthenticated()) {
      try {
        const isValid = await AuthService.verifyToken();
        if (isValid) {
          setIsAuthenticated(true);
          setUser(AuthService.getUser());
        } else {
          // Token invalid, clear auth
          AuthService.clearAuth();
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Token verification failed:', error);
        AuthService.clearAuth();
        setIsAuthenticated(false);
        setUser(null);
      }
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
    
    setIsLoading(false);
  };

  const handleLogin = async (email, password) => {
    setIsLoginLoading(true);
    setLoginError('');

    try {
      const user = await AuthService.login(email, password);
      setIsAuthenticated(true);
      setUser(user);
    } catch (error) {
      console.error('Login failed:', error);
      setLoginError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 flex items-center justify-center" data-theme="eugenia">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg text-brand-600"></div>
          <p className="mt-4 text-warm-700">Loading Eugenia ISA...</p>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <LoginForm 
        onLogin={handleLogin}
        isLoading={isLoginLoading}
        error={loginError}
      />
    );
  }

  // Show main app if authenticated, pass user and logout function
  return React.cloneElement(children, { 
    user, 
    onLogout: handleLogout 
  });
};

export default AuthWrapper;