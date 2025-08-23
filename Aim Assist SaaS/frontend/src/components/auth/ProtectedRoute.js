/**
 * Protected Route Component
 * Ensures users are authenticated and have completed their profile
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ProtectedRoute = ({ children, requireProfile = true }) => {
  const { user, tenant, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-base-content/60">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if profile completion is required
  if (requireProfile && !tenant) {
    // Allow access to profile completion page
    if (location.pathname === '/onboarding/complete-profile') {
      return children;
    }
    // Redirect to profile completion if profile is incomplete
    return <Navigate to="/onboarding/complete-profile" replace />;
  }

  // User is authenticated and has completed profile (or doesn't need to)
  return children;
};

export default ProtectedRoute;