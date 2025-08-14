#!/bin/bash

echo "🎯 Starting Aim Assist SaaS Development Environment"
echo "================================================"

# Kill any existing processes on our ports
echo "Cleaning up existing processes..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start backend
echo "Starting backend API server..."
cd "$SCRIPT_DIR/backend" && npm start &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to start..."
sleep 3

# Check backend health
HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null)
if echo "$HEALTH" | grep -q "aim-assist-api"; then
  echo "✅ Backend is running on http://localhost:3001"
else
  echo "❌ Backend failed to start"
  exit 1
fi

# Start frontend
echo "Starting frontend React app..."
cd "$SCRIPT_DIR/frontend" && npm start &
FRONTEND_PID=$!

echo ""
echo "================================================"
echo "🚀 Aim Assist SaaS is starting up!"
echo "================================================"
echo "Backend API: http://localhost:3001"
echo "Frontend UI: http://localhost:3000"
echo "Health Check: http://localhost:3001/health"
echo ""
echo "Press Ctrl+C to stop all services"
echo "================================================"

# Wait for Ctrl+C
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait