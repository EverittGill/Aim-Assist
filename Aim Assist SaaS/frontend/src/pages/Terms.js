import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link to="/" className="btn btn-ghost mb-6">← Back</Link>
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-lg max-w-none">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2>1. Acceptance of Terms</h2>
          <p>By using Aim Assist, you agree to these terms...</p>
          <h2>2. Service Description</h2>
          <p>Aim Assist provides AI-powered lead management services...</p>
          <h2>3. User Responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account...</p>
          <h2>4. Privacy</h2>
          <p>Your use of our service is also governed by our Privacy Policy...</p>
          <h2>5. Billing</h2>
          <p>Subscription fees are billed monthly...</p>
        </div>
      </div>
    </div>
  );
};

export default Terms;