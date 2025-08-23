/**
 * Landing Page
 * Public homepage showcasing Aim Assist features and benefits
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Landing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // If user is already authenticated, redirect to dashboard
  if (user) {
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Navigation */}
      <nav className="navbar bg-base-100 shadow-lg">
        <div className="navbar-start">
          <h1 className="text-2xl font-bold text-primary">Aim Assist</h1>
        </div>
        <div className="navbar-end space-x-4">
          <Link to="/login" className="btn btn-ghost">
            Sign In
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero py-20">
        <div className="hero-content text-center max-w-4xl">
          <div>
            <h1 className="text-5xl font-bold text-base-content mb-6">
              AI-Powered Real Estate
              <br />
              <span className="text-primary">Lead Management</span>
            </h1>
            <p className="text-xl text-base-content/70 mb-8 max-w-3xl mx-auto">
              Automate your lead nurturing with intelligent SMS conversations. 
              Qualify prospects 24/7 while you focus on closing deals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup" className="btn btn-primary btn-lg">
                Start Your Free Trial
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button className="btn btn-outline btn-lg">
                Watch Demo
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2-10a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-base-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-base-content mb-4">
              Why Real Estate Agents Choose Aim Assist
            </h2>
            <p className="text-xl text-base-content/70 max-w-2xl mx-auto">
              Transform your lead management with intelligent automation that actually works
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h3 className="card-title justify-center text-xl mb-4">Smart AI Conversations</h3>
                <p className="text-base-content/70">
                  Our AI remembers every conversation and responds naturally to leads, 
                  keeping them engaged while you sleep.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">📱</div>
                <h3 className="card-title justify-center text-xl mb-4">Instant SMS Responses</h3>
                <p className="text-base-content/70">
                  Respond to leads within seconds, 24/7. Never miss a hot prospect 
                  because you were in a showing or meeting.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">🎯</div>
                <h3 className="card-title justify-center text-xl mb-4">Lead Qualification</h3>
                <p className="text-base-content/70">
                  Automatically qualify leads by asking the right questions about 
                  timeline, budget, and motivation.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">🔄</div>
                <h3 className="card-title justify-center text-xl mb-4">CRM Integration</h3>
                <p className="text-base-content/70">
                  Works seamlessly with Follow Up Boss, Lofty, and other popular 
                  real estate CRMs you already use.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">📊</div>
                <h3 className="card-title justify-center text-xl mb-4">Smart Analytics</h3>
                <p className="text-base-content/70">
                  Track response rates, conversion metrics, and lead quality 
                  to optimize your marketing spend.
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center">
                <div className="text-5xl mb-4">⚡</div>
                <h3 className="card-title justify-center text-xl mb-4">Quick Setup</h3>
                <p className="text-base-content/70">
                  Get started in under 10 minutes. No complex integrations 
                  or technical expertise required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 bg-base-200">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-base-content mb-8">
            Join Thousands of Successful Agents
          </h2>
          <div className="stats stats-vertical lg:stats-horizontal shadow-xl bg-base-100">
            <div className="stat">
              <div className="stat-figure text-primary">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="stat-title">Leads Qualified</div>
              <div className="stat-value text-primary">50K+</div>
              <div className="stat-desc">In the last month</div>
            </div>
            
            <div className="stat">
              <div className="stat-figure text-secondary">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                </svg>
              </div>
              <div className="stat-title">Active Agents</div>
              <div className="stat-value text-secondary">2,500+</div>
              <div className="stat-desc">Nationwide</div>
            </div>
            
            <div className="stat">
              <div className="stat-figure text-accent">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="stat-title">Response Rate</div>
              <div className="stat-value text-accent">94%</div>
              <div className="stat-desc">Within 2 minutes</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 bg-base-100">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-base-content mb-8">
            Simple, Transparent Pricing
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <h3 className="card-title justify-center text-2xl">Individual Agent</h3>
                <div className="text-4xl font-bold text-primary my-4">
                  $97<span className="text-lg font-normal">/month</span>
                </div>
                <ul className="space-y-2 text-left">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-success mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Unlimited lead conversations
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-success mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    CRM integrations
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-success mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Analytics dashboard
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-success mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    14-day free trial
                  </li>
                </ul>
              </div>
            </div>

            <div className="card bg-primary text-primary-content shadow-xl">
              <div className="card-body">
                <h3 className="card-title justify-center text-2xl">Brokerage</h3>
                <div className="text-4xl font-bold my-4">
                  $67<span className="text-lg font-normal">/agent/month</span>
                </div>
                <ul className="space-y-2 text-left">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Everything in Individual
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Team management
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Centralized billing
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Volume discounts
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-content">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Transform Your Lead Management?
          </h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Join thousands of successful real estate agents who are already closing more deals with Aim Assist.
          </p>
          <Link to="/signup" className="btn btn-secondary btn-lg">
            Start Your Free Trial Now
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-sm mt-4 opacity-75">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer footer-center p-10 bg-base-200 text-base-content">
        <div>
          <h3 className="text-lg font-bold">Aim Assist</h3>
          <p className="max-w-md">
            AI-powered real estate lead management that actually works.
          </p>
        </div>
        <div>
          <div className="grid grid-flow-col gap-4">
            <Link to="/terms" className="link link-hover">Terms</Link>
            <Link to="/privacy" className="link link-hover">Privacy</Link>
            <Link to="/support" className="link link-hover">Support</Link>
          </div>
        </div>
        <div>
          <p>© 2025 Aim Assist. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;