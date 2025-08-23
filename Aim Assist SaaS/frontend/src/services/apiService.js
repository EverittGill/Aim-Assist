/**
 * API Service
 * Handles all backend API communication with authentication
 */

import axios from 'axios';
import { supabase } from '../config/supabase';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance
const apiService = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
apiService.interceptors.request.use(
  async (config) => {
    console.log('Making request to:', config.url);
    
    try {
      // Get the session from localStorage directly to avoid circular dependency
      const storageKey = 'aim-assist-auth';
      const sessionString = localStorage.getItem(storageKey);
      
      if (sessionString) {
        const sessionData = JSON.parse(sessionString);
        console.log('Session data structure:', Object.keys(sessionData));
        
        // Try different possible session locations
        const session = sessionData?.currentSession || sessionData?.session || sessionData;
        
        // Look for access_token in various possible locations
        const accessToken = session?.access_token || 
                           session?.user?.access_token || 
                           sessionData?.access_token;
        
        if (accessToken) {
          console.log('Adding auth token from storage');
          config.headers.Authorization = `Bearer ${accessToken}`;
        } else {
          console.log('No valid session in storage, data:', sessionData);
        }
      } else {
        console.log('No session in localStorage');
      }
    } catch (err) {
      console.error('Error getting session from storage:', err);
    }
    
    console.log('Returning config, about to make actual request');
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Handle auth errors
apiService.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  async (error) => {
    console.error('API Error:', error.config?.url, error.response?.status, error.message);
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) throw refreshError;
        
        if (session) {
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          return apiService(originalRequest);
        }
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// API methods
const api = {
  // Auth endpoints
  auth: {
    socialSignup: (data) => apiService.post('/auth/social-signup', data),
    verifyToken: () => apiService.post('/auth/verify'),
    refreshToken: () => apiService.post('/auth/refresh')
  },
  
  // Tenant endpoints
  tenants: {
    getCurrent: () => {
      console.log('Fetching current tenant from:', `${API_URL}/tenants/current`);
      return apiService.get('/tenants/current');
    },
    create: (data) => apiService.post('/tenants', data),
    createBrokerage: (data) => apiService.post('/tenants/brokerage', data),
    createAgent: (brokerageId, data) => apiService.post(`/tenants/${brokerageId}/agents`, data),
    update: (id, data) => apiService.put(`/tenants/${id}`, data),
    getAgents: (brokerageId) => apiService.get(`/tenants/${brokerageId}/agents`),
    joinBrokerage: (code) => apiService.post('/tenants/join', { code })
  },
  
  // Lead endpoints
  leads: {
    list: (params) => apiService.get('/leads', { params }),
    get: (id) => apiService.get(`/leads/${id}`),
    create: (data) => apiService.post('/leads', data),
    update: (id, data) => apiService.put(`/leads/${id}`, data),
    delete: (id) => apiService.delete(`/leads/${id}`),
    updateAIStatus: (id, status) => apiService.put(`/leads/${id}/status`, { status })
  },
  
  // Conversation endpoints
  conversations: {
    getMessages: (leadId) => apiService.get(`/conversations/${leadId}`),
    sendMessage: (leadId, content) => apiService.post('/conversations/send', { 
      lead_id: leadId, 
      content: content 
    }),
    generateAIResponse: (leadId, context) => apiService.post('/conversations/generate', { 
      lead_id: leadId, 
      ...context 
    })
  },
  
  // Settings endpoints
  settings: {
    get: () => apiService.get('/settings'),
    updateCompany: (data) => apiService.put('/settings/company', data),
    updateAI: (data) => apiService.put('/settings/ai', data),
    updateCampaigns: (data) => apiService.put('/settings/campaigns', data),
    updatePrompts: (data) => apiService.put('/settings/prompts', data),
    updatePhones: (data) => apiService.put('/settings/phones', data),
    updateCRM: (data) => apiService.put('/settings/crm', data),
    updateTags: (data) => apiService.put('/settings/tags', data)
  },
  
  // Analytics endpoints
  analytics: {
    getOverview: (dateRange) => apiService.get('/analytics/overview', { params: dateRange }),
    getFunnel: (dateRange) => apiService.get('/analytics/funnel', { params: dateRange }),
    getReports: (type, params) => apiService.get(`/analytics/reports/${type}`, { params })
  },
  
  // Billing endpoints
  billing: {
    getSubscription: () => apiService.get('/billing/subscription'),
    updateSubscription: (plan) => apiService.put('/billing/subscription', { plan }),
    getUsage: () => apiService.get('/billing/usage'),
    updatePaymentMethod: (token) => apiService.post('/billing/payment-method', { token })
  }
};

export default api;