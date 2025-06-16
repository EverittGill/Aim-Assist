// src/services/apiService.js
// This file contains the functions to call the backend API.

const BACKEND_API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api'; // Your backend URL

/**
 * Core function to make API calls to the backend.
 * @param {string} endpoint - The API endpoint (e.g., '/leads').
 * @param {string} [method='GET'] - The HTTP method.
 * @param {object|null} [body=null] - The request body for POST/PUT etc.
 * @param {string} [actionName='Backend Action'] - A descriptive name for the action for logging/error messages.
 * @returns {Promise<object>} - A promise that resolves with the JSON response from the backend.
 * @throws {Error} - Throws an error if the API call fails or the response is not ok.
 */
export const callBackendAPI = async (endpoint, method = 'GET', body = null, actionName = "Backend Action") => {
  let requestUrl = `${BACKEND_API_BASE_URL}${endpoint}`;

  try {
    // Get auth token from localStorage
    const authToken = localStorage.getItem('eugenia_auth_token');
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Add auth header if token exists
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
    };

    if (method === 'GET') {
      // Add a cache-busting query parameter for GET requests
      requestUrl += (requestUrl.includes('?') ? '&' : '?') + `_=${new Date().getTime()}`;
    }

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(requestUrl, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        message: `HTTP error! Status: ${response.status} ${response.statusText || ''}. Unable to parse error JSON.` 
      }));
      
      // If authentication failed, clear auth data
      if (response.status === 401) {
        localStorage.removeItem('eugenia_auth_token');
        localStorage.removeItem('eugenia_user');
        
        // Reload page to show login form
        if (window.location.pathname !== '/login') {
          window.location.reload();
        }
      }
      
      const error = new Error(`${actionName} failed (${response.status}): ${errorData.message || response.statusText || 'Unknown backend error'}`);
      error.status = response.status; // Attach status for more specific handling if needed
      error.data = errorData; // Attach full error data
      throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return await response.json();
    } else {
      // Handle non-JSON responses if necessary, e.g., for a 204 No Content from DELETE
      if (response.status === 204) return { message: `${actionName} successful (No Content).` };
      return { message: `${actionName} successful (non-JSON response).` };
    }
  } catch (error) {
    console.error(`Error in ${actionName} calling ${requestUrl}:`, error.message, error.data || '');
    // Re-throw the error so the calling component in App.js can catch it and set UI states
    throw error;
  }
};

// --- Specific API Service Functions ---

export const fetchLeads = async () => {
  return callBackendAPI('/leads', 'GET', null, "Fetch Leads");
};

export const createLead = async (newLeadData) => {
  return callBackendAPI('/leads', 'POST', newLeadData, "Create Lead");
};

export const deleteLead = async (leadId) => {
  return callBackendAPI(`/leads/${leadId}`, 'DELETE', null, "Delete Lead");
};

export const sendEugeniaMessage = async (payload) => {
  // Expected payload: { leadId, message, senderName, leadPhoneNumber }
  return callBackendAPI('/send-ai-message', 'POST', payload, "Send AI Message");
};

export const logIncomingLeadReplyAndGetNext = async (payload) => {
  // Expected payload: { leadId, leadName, message, currentConversation, leadPhoneNumber }
  return callBackendAPI('/log-incoming-message', 'POST', payload, "Log Lead Reply & Get AI Response");
};

export const initiateNewLeadProcessing = async () => {
  return callBackendAPI('/initiate-ai-outreach', 'POST', null, "Process New Leads");
};

export const generateInitialMessage = async (leadDetails, agencyName) => {
  return callBackendAPI('/generate-initial-message', 'POST', { leadDetails, agencyName }, "Generate Initial AI Message");
};

export const generateAIReply = async (leadDetails, conversationHistory, agencyName) => {
  return callBackendAPI('/generate-reply', 'POST', { leadDetails, conversationHistory, agencyName }, "Generate AI Reply");
};

export const updateLeadStatus = async (leadId, status) => {
  return callBackendAPI(`/leads/${leadId}/status`, 'PUT', { status }, "Update Lead Status");
};