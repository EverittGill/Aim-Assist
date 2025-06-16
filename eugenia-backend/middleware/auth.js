module.exports = (authService) => {
  if (!authService) {
    return (req, res, next) => {
      console.warn('Authentication middleware bypassed - auth service not configured');
      next();
    };
  }
  
  return authService.createAuthMiddleware();
};