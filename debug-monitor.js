#!/usr/bin/env node

const WebSocket = require('ws');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function connectToChrome() {
  try {
    // Get list of tabs
    const response = await fetch('http://localhost:9222/json');
    const tabs = await response.json();
    
    // Find your Aim Assist tab
    const aimAssistTab = tabs.find(tab => 
      tab.url && tab.url.includes('localhost:3000')
    );
    
    if (!aimAssistTab) {
      console.log('❌ No Aim Assist tab found. Please open http://localhost:3000 in Chrome');
      return;
    }
    
    console.log(`🎯 Found Aim Assist tab: ${aimAssistTab.title}`);
    console.log(`🔗 URL: ${aimAssistTab.url}`);
    
    // Connect to the tab's WebSocket
    const ws = new WebSocket(aimAssistTab.webSocketDebuggerUrl);
    
    ws.on('open', () => {
      console.log('✅ Connected to Chrome DevTools');
      
      // Enable console and network domains
      ws.send(JSON.stringify({id: 1, method: 'Console.enable'}));
      ws.send(JSON.stringify({id: 2, method: 'Network.enable'}));
      ws.send(JSON.stringify({id: 3, method: 'Runtime.enable'}));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      // Console messages
      if (message.method === 'Console.messageAdded') {
        const msg = message.params.message;
        const level = msg.level.toUpperCase();
        const timestamp = new Date().toLocaleTimeString();
        console.log(`\n[${timestamp}] 🖥️  CONSOLE ${level}: ${msg.text}`);
      }
      
      // Network requests
      if (message.method === 'Network.requestWillBeSent') {
        const req = message.params.request;
        const timestamp = new Date().toLocaleTimeString();
        console.log(`\n[${timestamp}] 🌐 REQUEST: ${req.method} ${req.url}`);
      }
      
      // Network responses
      if (message.method === 'Network.responseReceived') {
        const resp = message.params.response;
        const timestamp = new Date().toLocaleTimeString();
        const status = resp.status;
        const statusIcon = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
        console.log(`[${timestamp}] ${statusIcon} RESPONSE: ${status} ${resp.url}`);
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('🔌 Connection closed');
    });
    
  } catch (error) {
    console.error('❌ Error connecting to Chrome:', error.message);
  }
}

console.log('🚀 Starting Chrome Debug Monitor...');
console.log('📱 Open your Aim Assist SaaS at http://localhost:3000');
console.log('👁️  Watching for console logs and network activity...\n');

connectToChrome();