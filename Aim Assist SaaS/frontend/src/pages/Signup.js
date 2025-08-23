/**
 * Signup Page
 * Initial signup with account type selection
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SocialAuthButtons from '../components/auth/SocialAuthButtons';

const Signup = () => {
  const navigate = useNavigate();
  const { signUpWithEmail, user } = useAuth();
  const [accountType, setAccountType] = useState('individual'); // Default to individual
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    companyName: '',
    brokerageCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccountTypeChange = (type) => {
    setAccountType(type);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    
    try {
      // Sign up with Supabase
      await signUpWithEmail(formData.email, formData.password, {
        full_name: formData.fullName,
        phone: formData.phone,
        account_type: accountType,
        company_name: formData.companyName
      });
      
      // Redirect to onboarding
      navigate('/onboarding/complete-profile', {
        state: { accountType, formData }
      });
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // If user authenticated via social, skip to profile completion
  if (user) {
    navigate('/onboarding/complete-profile');
  }

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">Aim Assist</h1>
          <p className="text-base-content/70 mt-2">Start Your 14-Day Free Trial</p>
        </div>

        {/* Signup Form */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-6">Create Your Account</h2>

            {/* Error Alert */}
            {error && (
              <div className="alert alert-error mb-4">
                <span>{error}</span>
              </div>
            )}

            {/* Social Auth */}
            <div className="mb-6">
              <SocialAuthButtons mode="signup" />
            </div>

            <div className="divider">OR</div>

            {/* Email Signup Form */}
            <form onSubmit={handleEmailSignup} className="space-y-4">
              {/* Account Type Selection */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Account Type</span>
                </label>
                <div className="grid grid-cols-1 gap-3">
                  <label className="label cursor-pointer border rounded-lg p-4 hover:bg-base-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="accountType" 
                        value="individual"
                        className="radio radio-primary" 
                        checked={accountType === 'individual'}
                        onChange={(e) => handleAccountTypeChange(e.target.value)}
                      />
                      <div>
                        <span className="text-2xl">👤</span>
                        <div className="ml-2 inline-block">
                          <span className="font-semibold">Individual Agent</span>
                          <p className="text-sm text-base-content/70">Personal account for individual agents</p>
                        </div>
                      </div>
                    </div>
                  </label>
                  
                  <label className="label cursor-pointer border rounded-lg p-4 hover:bg-base-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="accountType" 
                        value="brokerage"
                        className="radio radio-primary" 
                        checked={accountType === 'brokerage'}
                        onChange={(e) => handleAccountTypeChange(e.target.value)}
                      />
                      <div>
                        <span className="text-2xl">🏢</span>
                        <div className="ml-2 inline-block">
                          <span className="font-semibold">Brokerage</span>
                          <p className="text-sm text-base-content/70">Manage multiple agents and teams</p>
                        </div>
                      </div>
                    </div>
                  </label>
                  
                  <label className="label cursor-pointer border rounded-lg p-4 hover:bg-base-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="accountType" 
                        value="join"
                        className="radio radio-primary" 
                        checked={accountType === 'join'}
                        onChange={(e) => handleAccountTypeChange(e.target.value)}
                      />
                      <div>
                        <span className="text-2xl">🤝</span>
                        <div className="ml-2 inline-block">
                          <span className="font-semibold">Join Brokerage</span>
                          <p className="text-sm text-base-content/70">Join an existing brokerage account</p>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Conditional fields based on account type */}
              {accountType === 'join' ? (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Brokerage Code</span>
                  </label>
                  <input
                    type="text"
                    name="brokerageCode"
                    placeholder="Enter code from your brokerage"
                    className="input input-bordered"
                    value={formData.brokerageCode}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Full Name</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      placeholder="John Doe"
                      className="input input-bordered"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  {accountType === 'brokerage' && (
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Company Name</span>
                      </label>
                      <input
                        type="text"
                        name="companyName"
                        placeholder="Your brokerage name"
                        className="input input-bordered"
                        value={formData.companyName}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  )}

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Email</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      className="input input-bordered"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Phone</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="+1 (555) 123-4567"
                      className="input input-bordered"
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Password</span>
                      </label>
                      <input
                        type="password"
                        name="password"
                        placeholder="••••••••"
                        className="input input-bordered"
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        minLength={8}
                      />
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Confirm Password</span>
                      </label>
                      <input
                        type="password"
                        name="confirmPassword"
                        placeholder="••••••••"
                        className="input input-bordered"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary"
                    required
                  />
                  <span className="label-text">
                    I agree to the{' '}
                    <Link to="/terms" className="link link-primary">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="link link-primary">Privacy Policy</Link>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Start Free Trial'}
              </button>
            </form>

            {/* Login Link */}
            <div className="text-center mt-6">
              <span className="text-sm">
                Already have an account?{' '}
                <Link to="/login" className="link link-primary font-semibold">
                  Sign In
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;