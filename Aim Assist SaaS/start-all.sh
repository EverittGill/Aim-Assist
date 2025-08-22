#!/bin/bash

# Start script for Aim Assist SaaS
# Starts both frontend and backend simultaneously

echo "🚀 Starting Aim Assist SaaS Platform..."
echo "=================================="

# Get the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start backend in background
echo "📦 Starting backend server on port 3001..."
(cd "$DIR/backend" && npm run dev) &
BACKEND_PID=$!

# Give backend a moment to start
sleep 3

# Start frontend
echo "🎨 Starting frontend on port 3000..."
(cd "$DIR/frontend" && npm start) &
FRONTEND_PID=$!

echo ""
echo "=================================="
echo "✅ Services starting..."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "📍 Access the app at: http://localhost:3000"
echo "📍 API running at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
echo "=================================="

# Function to kill both processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

# Set up trap to catch Ctrl+C
trap cleanup INT

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID