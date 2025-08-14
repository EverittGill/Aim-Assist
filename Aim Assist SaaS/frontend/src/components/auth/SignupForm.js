/**
 * Signup form for new tenants
 * Creates both tenant and user account
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSupabase } from '../../contexts/SupabaseContext';
import { Building2, User, Mail, Lock, Loader, AlertCircle, CheckCircle } from 'lucide-react';

function SignupForm() {
  const navigate = useNavigate();
  const { signUp } = useSupabase();
  
  const [formData, setFormData] = useState({
    tenantName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setError('');
    setLoading(true);

    try {
      const { user, tenant } = await signUp({
        email: formData.email,
        password: formData.password,
        tenantName: formData.tenantName,
        firstName: formData.firstName,
        lastName: formData.lastName
      });

      setSuccess(true);
      
      // Show success message then redirect
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Account Created!</h2>
          <p className="text-gray-600 mb-4">
            Your 14-day free trial has started.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🎯 Aim Assist
          </h1>
          <p className="text-gray-600">Start your 14-day free trial</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start">
            <AlertCircle className="mr-2 mt-0.5" size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                name="tenantName"
                value={formData.tenantName}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Your Company"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400" size={18} />
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="John"
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Doe"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="you@company.com"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
              />
            </div>
          </div>

          {/* Trial Badge */}
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
            ✨ 14-day free trial • No credit card required
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 px-4 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition duration-200 flex items-center justify-center disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader className="animate-spin mr-2" size={20} />
                Creating Account...
              </>
            ) : (
              'Start Free Trial'
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-6 text-center">
          <div className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignupForm;