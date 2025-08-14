const express = require('express');
const router = express.Router();
const axios = require('axios');

// Endpoint to check frontend status and capture screenshot
router.get('/frontend-status', async (req, res) => {
  try {
    // Check if frontend is running
    const response = await axios.get('http://localhost:3000', {
      timeout: 5000,
      validateStatus: () => true // Accept any status
    });
    
    res.json({
      status: 'online',
      statusCode: response.status,
      title: response.data.match(/<title>(.*?)<\/title>/)?.[1] || 'No title',
      hasReactRoot: response.data.includes('id="root"'),
      contentLength: response.data.length,
      preview: response.data.substring(0, 500)
    });
  } catch (error) {
    res.json({
      status: 'offline',
      error: error.message,
      suggestion: 'Run: cd frontend && npm start'
    });
  }
});

module.exports = router;