import React from 'react';
import { Link } from 'react-router-dom';

const Support = () => {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link to="/dashboard" className="btn btn-ghost mb-6">← Back to Dashboard</Link>
        <h1 className="text-4xl font-bold mb-8">Support Center</h1>
        
        <div className="grid gap-6">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Documentation</h2>
              <p>Browse our comprehensive guides and tutorials.</p>
              <div className="card-actions justify-end">
                <button className="btn btn-primary">View Docs</button>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">Contact Support</h2>
              <p>Email: support@aimassist.ai</p>
              <p>Response time: Within 24 hours</p>
            </div>
          </div>

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title">System Status</h2>
              <div className="flex items-center gap-2">
                <div className="badge badge-success gap-1">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                  All Systems Operational
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;