#!/bin/bash

# Eugenia Startup Script
# This script starts both the backend and frontend servers

echo "🚀 Starting Eugenia ISA..."

# Kill any existing processes on ports 3000 and 3001
echo "Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 2

# Start backend
echo "Starting backend server on port 3001..."
cd eugenia-backend
node server.js &
BACKEND_PID=$!

# Wait for backend to start
sleep 5

# Start frontend
echo "Starting frontend server on port 3000..."
cd ../eugenia-frontend
npm start &
FRONTEND_PID=$!

echo "✅ Eugenia is starting up!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "🌐 Access the app at: http://localhost:3000"
echo "📊 Backend API at: http://localhost:3001/api"
echo ""
echo "To stop all servers, run: pkill -f 'node server.js' && pkill -f 'react-scripts'"

# Keep script running
wait