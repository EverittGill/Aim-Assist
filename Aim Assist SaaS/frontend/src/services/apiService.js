import { authService } from './authService';

class ApiService {
  constructor() {
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authService.getAuthHeaders(),
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          authService.logout();
          window.location.href = '/login';
          throw new Error('Authentication required');
        }
        
        const error = await response.json();
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Tenant endpoints
  async getTenant(tenantId) {
    return this.request(`/tenants/${tenantId}`);
  }

  async updateTenant(tenantId, data) {
    return this.request(`/tenants/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getTenantStats(tenantId) {
    return this.request(`/tenants/${tenantId}/stats`);
  }

  // Lead endpoints
  async getLeads(tenantId, filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/leads?tenant_id=${tenantId}${params ? `&${params}` : ''}`);
  }

  async getLead(leadId) {
    return this.request(`/leads/${leadId}`);
  }

  async createLead(data) {
    return this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateLead(leadId, data) {
    return this.request(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteLead(leadId) {
    return this.request(`/leads/${leadId}`, {
      method: 'DELETE'
    });
  }

  // Conversation endpoints
  async getConversation(leadId) {
    return this.request(`/conversations/${leadId}`);
  }

  async sendMessage(data) {
    return this.request('/messages/send', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async generateAIMessage(data) {
    return this.request('/ai/generate', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Automation endpoints
  async getAutoTextRules(tenantId) {
    return this.request(`/automation/rules?tenant_id=${tenantId}`);
  }

  async createAutoTextRule(data) {
    return this.request('/automation/rules', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAutoTextRule(ruleId, data) {
    return this.request(`/automation/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteAutoTextRule(ruleId) {
    return this.request(`/automation/rules/${ruleId}`, {
      method: 'DELETE'
    });
  }

  // Template endpoints
  async getTemplates(tenantId) {
    return this.request(`/templates?tenant_id=${tenantId}`);
  }

  async saveTemplate(data) {
    return this.request('/templates', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTemplate(templateId, data) {
    return this.request(`/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteTemplate(templateId) {
    return this.request(`/templates/${templateId}`, {
      method: 'DELETE'
    });
  }

  // Settings endpoints
  async getSettings(tenantId) {
    return this.request(`/settings/${tenantId}`);
  }

  async updateSettings(tenantId, settings) {
    return this.request(`/settings/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Billing endpoints
  async getBilling(tenantId) {
    return this.request(`/billing/${tenantId}`);
  }

  async getUsage(tenantId) {
    return this.request(`/billing/${tenantId}/usage`);
  }

  async updateSubscription(tenantId, planId) {
    return this.request(`/billing/${tenantId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({ plan_id: planId })
    });
  }

  // Webhook endpoints for CRM integration
  async testCRMConnection(tenantId) {
    return this.request(`/crm/test`, {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId })
    });
  }

  async syncCRMData(tenantId) {
    return this.request(`/crm/sync`, {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId })
    });
  }
}

export const apiService = new ApiService();