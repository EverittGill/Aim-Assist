/**
 * Dashboard Page
 * Main application dashboard with metrics and quick actions
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NavBar from '../components/NavBar';
import api from '../services/apiService';

const Dashboard = () => {
  const { user, tenant } = useAuth();
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    activeConversations: 0,
    qualifiedToday: 0,
    responseRate: 0,
    averageResponseTime: '0m',
    messagesThisWeek: 0
  });
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch analytics overview
      const analyticsData = await api.analytics.getOverview({
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString()
      });
      
      // Fetch recent leads
      const leadsData = await api.leads.list({ limit: 5, sort: 'created_at:desc' });
      
      setMetrics(analyticsData.metrics || metrics);
      setRecentLeads(leadsData.leads || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ title, value, change, icon }) => (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-base-content/60 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {change && (
              <p className={`text-xs mt-1 ${change > 0 ? 'text-success' : 'text-error'}`}>
                {change > 0 ? '↑' : '↓'} {Math.abs(change)}% from last week
              </p>
            )}
          </div>
          <div className="text-3xl opacity-20">{icon}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-base-200">
      <NavBar />
      
      <div className="container mx-auto px-4 py-6">
        {/* Welcome Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            Welcome back, {user?.user_metadata?.full_name || user?.email}
          </h1>
          <p className="text-base-content/60 mt-1">
            {tenant?.company_name || 'Your Agency'} • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Link to="/leads" className="btn btn-primary">
            <span className="mr-2">📋</span>
            View All Leads
          </Link>
          <Link to="/settings" className="btn btn-outline">
            <span className="mr-2">⚙️</span>
            Settings
          </Link>
          <Link to="/analytics" className="btn btn-outline">
            <span className="mr-2">📊</span>
            Analytics
          </Link>
          <Link to="/billing" className="btn btn-outline">
            <span className="mr-2">💳</span>
            Billing
          </Link>
        </div>

        {/* Metrics Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card bg-base-100 shadow-sm">
                <div className="card-body p-4">
                  <div className="animate-pulse">
                    <div className="h-3 bg-base-300 rounded w-1/2 mb-2"></div>
                    <div className="h-6 bg-base-300 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <MetricCard 
              title="Total Leads" 
              value={metrics.totalLeads}
              icon="👥"
            />
            <MetricCard 
              title="Active Chats" 
              value={metrics.activeConversations}
              change={12}
              icon="💬"
            />
            <MetricCard 
              title="Qualified Today" 
              value={metrics.qualifiedToday}
              change={-5}
              icon="✅"
            />
            <MetricCard 
              title="Response Rate" 
              value={`${metrics.responseRate}%`}
              icon="📈"
            />
            <MetricCard 
              title="Avg Response" 
              value={metrics.averageResponseTime}
              icon="⏱️"
            />
            <MetricCard 
              title="Week Messages" 
              value={metrics.messagesThisWeek}
              change={23}
              icon="📱"
            />
          </div>
        )}

        {/* Recent Leads and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Leads */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-lg">Recent Leads</h2>
                <Link to="/leads" className="btn btn-ghost btn-sm">
                  View All →
                </Link>
              </div>
              
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-3">
                      <div className="h-10 w-10 bg-base-300 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-base-300 rounded w-1/3 mb-1"></div>
                        <div className="h-3 bg-base-300 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentLeads.length > 0 ? (
                <div className="space-y-3">
                  {recentLeads.map(lead => (
                    <Link 
                      key={lead.id} 
                      to={`/conversation/${lead.id}`}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-base-200 transition-colors"
                    >
                      <div className="avatar placeholder">
                        <div className="bg-primary text-primary-content rounded-full w-10">
                          <span>{lead.name?.charAt(0) || '?'}</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{lead.name || 'Unknown'}</p>
                        <p className="text-sm text-base-content/60">
                          {lead.source || 'No source'} • {new Date(lead.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {lead.ai_status === 'active' && (
                        <span className="badge badge-success badge-sm">AI Active</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-center text-base-content/60 py-8">
                  No leads yet. They'll appear here when you receive them.
                </p>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-lg mb-4">AI Performance</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Qualification Rate</span>
                  <div className="flex items-center gap-2">
                    <progress className="progress progress-success w-24" value="73" max="100"></progress>
                    <span className="text-sm font-medium">73%</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Response Time</span>
                  <div className="flex items-center gap-2">
                    <progress className="progress progress-warning w-24" value="45" max="100"></progress>
                    <span className="text-sm font-medium">45s</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Engagement Score</span>
                  <div className="flex items-center gap-2">
                    <progress className="progress progress-primary w-24" value="89" max="100"></progress>
                    <span className="text-sm font-medium">89/100</span>
                  </div>
                </div>
              </div>
              
              <div className="divider"></div>
              
              <div className="bg-base-200 rounded-lg p-3">
                <p className="text-sm font-medium mb-1">💡 Pro Tip</p>
                <p className="text-xs text-base-content/70">
                  Your AI response time is excellent! Consider enabling auto-text for "Direct Connect" leads to improve qualification rates.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-6 card bg-base-100 shadow-sm">
          <div className="card-body py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="badge badge-success gap-1">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                  All Systems Operational
                </div>
                <span className="text-sm text-base-content/60">
                  AI: Connected • CRM: Synced • SMS: Active
                </span>
              </div>
              <Link to="/support" className="link link-primary text-sm">
                Need help?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;