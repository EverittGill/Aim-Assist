// services/authService.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AuthService {
  constructor(jwtSecret) {
    if (!jwtSecret) {
      throw new Error('JWT secret is required for AuthService');
    }
    this.jwtSecret = jwtSecret;
    this.tokenExpiration = '7d'; // 7 days for persistent login
  }

  // Hash password for storage
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verify password against hash
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Generate JWT token
  generateToken(userId, email) {
    const payload = {
      userId,
      email,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiration
    });
  }

  // Verify and decode JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  // Refresh token (generate new token with same user data)
  refreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, { ignoreExpiration: true });
      return this.generateToken(decoded.userId, decoded.email);
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  }

  // Simple user authentication (for demo - you'd typically use a database)
  async authenticateUser(email, password) {
    // For this demo, we'll use environment variables for a single admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@eugenia.app';
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminPasswordHash) {
      throw new Error('Admin user not configured');
    }

    if (email !== adminEmail) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(password, adminPasswordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    return {
      userId: 'admin',
      email: adminEmail,
      role: 'admin'
    };
  }

  // Middleware function for protecting routes
  createAuthMiddleware() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      try {
        const decoded = this.verifyToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: error.message });
      }
    };
  }
}

module.exports = AuthService;