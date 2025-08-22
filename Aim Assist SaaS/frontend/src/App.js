import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LoginForm from './components/LoginForm';
import { authService } from './services/authService';
import { apiService } from './services/apiService';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        // Load tenant data
        const tenantData = await apiService.getTenant(currentUser.tenant_id);
        setTenant(tenantData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (credentials) => {
    try {
      const { user, tenant } = await authService.login(credentials);
      setUser(user);
      setTenant(tenant);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setTenant(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <Dashboard 
      user={user} 
      tenant={tenant}
      onLogout={handleLogout}
    />
  );
}

export default App;