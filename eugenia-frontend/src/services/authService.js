// src/services/authService.js
import { callBackendAPI } from './apiService';

const TOKEN_STORAGE_KEY = 'eugenia_auth_token';
const USER_STORAGE_KEY = 'eugenia_user';

export class AuthService {
  // Get stored token
  static getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  // Get stored user
  static getUser() {
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    return userStr ? JSON.parse(userStr) : null;
  }

  // Store token and user
  static setAuth(token, user) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  // Clear stored auth data
  static clearAuth() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  // Check if user is authenticated
  static isAuthenticated() {
    const token = this.getToken();
    const user = this.getUser();
    return !!(token && user);
  }

  // Login user
  static async login(email, password) {
    try {
      const response = await callBackendAPI('/auth/login', 'POST', { email, password }, 'Login');
      
      if (response.success) {
        this.setAuth(response.token, response.user);
        return response.user;
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  }

  // Verify current token
  static async verifyToken() {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const response = await callBackendAPI('/auth/verify', 'POST', { token }, 'Verify Token');
      return response.success;
    } catch (error) {
      // Token is invalid, clear it
      this.clearAuth();
      return false;
    }
  }

  // Refresh token
  static async refreshToken() {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const response = await callBackendAPI('/auth/refresh', 'POST', { token }, 'Refresh Token');
      if (response.success) {
        // Update token, keep existing user data
        const user = this.getUser();
        this.setAuth(response.token, user);
        return true;
      }
      return false;
    } catch (error) {
      this.clearAuth();
      return false;
    }
  }

  // Logout user
  static logout() {
    this.clearAuth();
  }

  // Auto-refresh token periodically
  static startTokenRefresh() {
    // Refresh token every 6 days (token expires in 7 days)
    const refreshInterval = 6 * 24 * 60 * 60 * 1000; // 6 days in milliseconds
    
    setInterval(async () => {
      if (this.isAuthenticated()) {
        try {
          await this.refreshToken();
        } catch (error) {
          console.warn('Token refresh failed:', error);
        }
      }
    }, refreshInterval);
  }
}