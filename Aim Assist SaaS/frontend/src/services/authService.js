class AuthService {
  constructor() {
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
    this.tokenKey = 'aim_assist_token';
    this.userKey = 'aim_assist_user';
  }

  async login(credentials) {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      
      // Store token and user data
      if (data.token) {
        localStorage.setItem(this.tokenKey, data.token);
      }
      if (data.user) {
        localStorage.setItem(this.userKey, JSON.stringify(data.user));
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;

    const userStr = localStorage.getItem(this.userKey);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }

    // Verify token with backend
    try {
      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          localStorage.setItem(this.userKey, JSON.stringify(data.user));
          return data.user;
        }
      }
    } catch (error) {
      console.error('Token verification failed:', error);
    }

    return null;
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  getAuthHeaders() {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();