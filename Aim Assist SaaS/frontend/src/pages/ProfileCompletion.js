/**
 * Profile Completion Page
 * Collects additional information after social auth signup
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/apiService';

const ProfileCompletion = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, tenant, refreshTenant, signOut } = useAuth();
  
  // Get account type from signup flow or determine from existing data
  const [accountType, setAccountType] = useState(location.state?.accountType || 'individual');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    // Basic Info
    fullName: location.state?.formData?.fullName || user?.user_metadata?.full_name || '',
    phone: location.state?.formData?.phone || '',
    companyName: location.state?.formData?.companyName || tenant?.company_name || '',
    
    // CRM Integration
    crmType: 'followupboss',
    fubApiKey: '',
    fubXSystem: '',
    fubXSystemKey: '',
    loftyApiKey: '',
    loftyWorkspace: '',
    
    // Phone Numbers
    twilioPhone: '',
    notificationPhone: '',
    
    // Lead Settings
    leadTags: ['Direct Connect', 'PPC'],
    autoTextEnabled: true,
    autoTextDelay: 2,
    
    // AI Settings
    aiProvider: 'claude',
    aiTemperature: 0.7,
    maxMessagesBeforeHuman: 5,
    
    // Brokerage specific
    brokerageCode: '',
    agentLimit: 10
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleTagsChange = (e) => {
    const tags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag);
    setFormData({
      ...formData,
      leadTags: tags
    });
  };

  const validateStep = (stepNumber) => {
    switch(stepNumber) {
      case 1:
        if (!formData.fullName || !formData.phone) {
          setError('Please fill in all required fields');
          return false;
        }
        if (accountType === 'brokerage' && !formData.companyName) {
          setError('Company name is required for brokerage accounts');
          return false;
        }
        // Also validate CRM in step 1
        if (formData.crmType === 'followupboss') {
          if (!formData.fubApiKey) {
            setError('Follow Up Boss API key is required');
            return false;
          }
        } else if (formData.crmType === 'lofty') {
          if (!formData.loftyApiKey || !formData.loftyWorkspace) {
            setError('Lofty API key and workspace are required');
            return false;
          }
        }
        break;
      case 2:
        if (!formData.twilioPhone || !formData.notificationPhone) {
          setError('Both phone numbers are required');
          return false;
        }
        break;
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
    setError('');
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    
    setLoading(true);
    setError('');
    
    try {
      let tenantData;
      
      // Prepare CRM config based on selected type
      const crmConfig = {};
      if (formData.crmType === 'followupboss') {
        crmConfig.type = 'followupboss';
        crmConfig.apiKey = formData.fubApiKey;
        crmConfig.xSystem = formData.fubXSystem;
        crmConfig.xSystemKey = formData.fubXSystemKey;
      } else if (formData.crmType === 'lofty') {
        crmConfig.type = 'lofty';
        crmConfig.apiKey = formData.loftyApiKey;
        crmConfig.workspace = formData.loftyWorkspace;
      }

      // Prepare submission data
      const submissionData = {
        name: formData.companyName || `${formData.fullName}'s Agency`,
        email: user.email,
        phone: formData.phone,
        twilioPhone: formData.twilioPhone,
        notificationPhone: formData.notificationPhone,
        crmConfig,
        leadTags: formData.leadTags,
        settings: {
          autoTextEnabled: formData.autoTextEnabled,
          autoTextDelay: formData.autoTextDelay,
          aiProvider: formData.aiProvider,
          aiTemperature: formData.aiTemperature,
          maxMessagesBeforeHuman: formData.maxMessagesBeforeHuman
        }
      };

      // Create or update tenant based on account type
      if (accountType === 'brokerage') {
        // Create brokerage
        tenantData = await api.tenants.createBrokerage({
          ...submissionData,
          agentLimit: formData.agentLimit
        });
      } else if (accountType === 'join') {
        // Join existing brokerage
        tenantData = await api.tenants.joinBrokerage(formData.brokerageCode);
        
        // Update agent profile
        await api.tenants.update(tenantData.id, {
          phone: formData.phone,
          notificationPhone: formData.notificationPhone
        });
      } else {
        // Individual agent account
        if (tenant?.id) {
          // Update existing tenant
          tenantData = await api.tenants.update(tenant.id, submissionData);
        } else {
          // Create new tenant
          tenantData = await api.tenants.create(submissionData);
        }
      }

      // Refresh tenant in auth context
      await refreshTenant();

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Profile completion error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Render different steps
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Basic Information & CRM Setup</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Full Name</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    className="input input-bordered"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Phone Number</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    className="input input-bordered"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+1 (555) 123-4567"
                    required
                  />
                </div>
              </div>

              {accountType === 'brokerage' && (
                <div className="form-control mb-6">
                  <label className="label">
                    <span className="label-text">Company Name</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    className="input input-bordered"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    placeholder="Awesome Realty Inc."
                    required
                  />
                </div>
              )}

              {accountType === 'join' && (
                <div className="form-control mb-6">
                  <label className="label">
                    <span className="label-text">Brokerage Code</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="brokerageCode"
                    className="input input-bordered"
                    value={formData.brokerageCode}
                    onChange={handleInputChange}
                    placeholder="Enter code from your brokerage"
                    required
                  />
                  <label className="label">
                    <span className="label-text-alt">Ask your broker for this code</span>
                  </label>
                </div>
              )}
            </div>

            <div className="divider">CRM Integration</div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Select Your CRM</span>
              </label>
              <select
                name="crmType"
                className="select select-bordered"
                value={formData.crmType}
                onChange={handleInputChange}
              >
                <option value="followupboss">Follow Up Boss</option>
                <option value="lofty">Lofty (Chime)</option>
                <option value="kvcore">kvCORE (Coming Soon)</option>
                <option value="liondesk">LionDesk (Coming Soon)</option>
              </select>
            </div>

            {formData.crmType === 'followupboss' && (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Follow Up Boss API Key</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="password"
                    name="fubApiKey"
                    className="input input-bordered font-mono"
                    value={formData.fubApiKey}
                    onChange={handleInputChange}
                    placeholder="Your FUB API key"
                    required
                  />
                  <label className="label">
                    <span className="label-text-alt">
                      Find this in FUB → Admin → API → API Key
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">X-System (Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="fubXSystem"
                      className="input input-bordered"
                      value={formData.fubXSystem}
                      onChange={handleInputChange}
                      placeholder="Your integration name"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">X-System-Key (Optional)</span>
                    </label>
                    <input
                      type="password"
                      name="fubXSystemKey"
                      className="input input-bordered font-mono"
                      value={formData.fubXSystemKey}
                      onChange={handleInputChange}
                      placeholder="Your system key"
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.crmType === 'lofty' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Lofty API Key</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="password"
                    name="loftyApiKey"
                    className="input input-bordered font-mono"
                    value={formData.loftyApiKey}
                    onChange={handleInputChange}
                    placeholder="Your Lofty API key"
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Workspace ID</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="loftyWorkspace"
                    className="input input-bordered"
                    value={formData.loftyWorkspace}
                    onChange={handleInputChange}
                    placeholder="Your workspace identifier"
                    required
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Phone Configuration</h3>
            
            <div className="alert alert-info">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span className="text-sm">
                You'll need a Twilio phone number for AI messaging. We'll help you set this up.
              </span>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">AI Assistant Phone Number</span>
                <span className="label-text-alt text-error">*</span>
              </label>
              <input
                type="tel"
                name="twilioPhone"
                className="input input-bordered"
                value={formData.twilioPhone}
                onChange={handleInputChange}
                placeholder="+1 (555) 123-4567"
                required
              />
              <label className="label">
                <span className="label-text-alt">Your Twilio number for AI conversations</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Your Notification Phone</span>
                <span className="label-text-alt text-error">*</span>
              </label>
              <input
                type="tel"
                name="notificationPhone"
                className="input input-bordered"
                value={formData.notificationPhone}
                onChange={handleInputChange}
                placeholder="+1 (555) 987-6543"
                required
              />
              <label className="label">
                <span className="label-text-alt">Where you'll receive qualified lead alerts</span>
              </label>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Lead & AI Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Lead Tags to Auto-Text</span>
                  </label>
                  <input
                    type="text"
                    name="leadTags"
                    className="input input-bordered"
                    value={formData.leadTags.join(', ')}
                    onChange={handleTagsChange}
                    placeholder="Direct Connect, PPC, AI Ready"
                  />
                  <label className="label">
                    <span className="label-text-alt">Tags that trigger AI outreach</span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">AI Provider</span>
                  </label>
                  <select
                    name="aiProvider"
                    className="select select-bordered"
                    value={formData.aiProvider}
                    onChange={handleInputChange}
                  >
                    <option value="claude">Claude 3.5 Sonnet (Recommended)</option>
                    <option value="openai">GPT-4</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label cursor-pointer">
                    <span className="label-text">Enable Auto-Text for New Leads</span>
                    <input
                      type="checkbox"
                      name="autoTextEnabled"
                      className="toggle toggle-primary"
                      checked={formData.autoTextEnabled}
                      onChange={handleInputChange}
                    />
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Messages Before Human Takeover</span>
                  </label>
                  <input
                    type="number"
                    name="maxMessagesBeforeHuman"
                    className="input input-bordered"
                    value={formData.maxMessagesBeforeHuman}
                    onChange={handleInputChange}
                    min="3"
                    max="10"
                  />
                  <label className="label">
                    <span className="label-text-alt">AI pauses after this many responses</span>
                  </label>
                </div>
              </div>

              {formData.autoTextEnabled && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Auto-Text Delay (minutes)</span>
                  </label>
                  <input
                    type="number"
                    name="autoTextDelay"
                    className="input input-bordered w-full md:w-1/3"
                    value={formData.autoTextDelay}
                    onChange={handleInputChange}
                    min="0"
                    max="60"
                  />
                  <label className="label">
                    <span className="label-text-alt">Time to wait before first AI message</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Header with Sign Out */}
        <div className="text-center mb-8">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-primary">Complete Your Profile</h1>
              <p className="text-base-content/70 mt-2">
                Just a few more steps to get your AI assistant running
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="btn btn-ghost btn-sm"
              title="Sign out and start over"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <ul className="steps steps-horizontal w-full">
            <li className={`step ${step >= 1 ? 'step-primary' : ''}`}>Info & CRM</li>
            <li className={`step ${step >= 2 ? 'step-primary' : ''}`}>Phone Setup</li>
            <li className={`step ${step >= 3 ? 'step-primary' : ''}`}>AI Settings</li>
          </ul>
        </div>

        {/* Form Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            {/* Error Alert */}
            {error && (
              <div className="alert alert-error mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Step Content */}
            {renderStep()}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
              {step > 1 ? (
                <button
                  onClick={handleBack}
                  className="btn btn-ghost"
                  disabled={loading}
                >
                  ← Back
                </button>
              ) : (
                <div></div>
              )}

              {step < 3 ? (
                <button
                  onClick={handleNext}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  className={`btn btn-primary ${loading ? 'loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Skip for now option */}
        {!loading && step === 1 && tenant?.id && (
          <div className="text-center mt-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="link link-primary text-sm"
            >
              Skip for now (complete later in settings)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileCompletion;