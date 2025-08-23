import React from 'react';
import NavBar from '../components/NavBar';

const Billing = () => {
  return (
    <div className="min-h-screen bg-base-200">
      <NavBar />
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">Billing</h1>
        <p>Billing and subscription management coming soon...</p>
      </div>
    </div>
  );
};

export default Billing;