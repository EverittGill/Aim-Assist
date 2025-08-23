import React from 'react';
import { Link } from 'react-router-dom';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link to="/" className="btn btn-ghost mb-6">← Back</Link>
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose prose-lg max-w-none">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2>1. Information We Collect</h2>
          <p>We collect information you provide directly to us...</p>
          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to provide and improve our services...</p>
          <h2>3. Information Sharing</h2>
          <p>We do not sell, trade, or rent your personal information...</p>
          <h2>4. Data Security</h2>
          <p>We implement appropriate security measures...</p>
          <h2>5. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please contact us...</p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;