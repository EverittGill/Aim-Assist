#!/bin/bash

echo "================================================"
echo "PHASE 1 WHEN/THEN TEST SUITE"
echo "================================================"

# Step 1.1: Project Structure
echo ""
echo "📦 Step 1.1: Initialize Project Structure"
echo "WHEN: Running 'npm install'"
echo "THEN: Both frontend and backend should have node_modules"
if [ -d "backend/node_modules" ] && [ -d "frontend/node_modules" ]; then
  echo "✅ PASS: node_modules exist in both directories"
else
  echo "❌ FAIL: Missing node_modules"
  exit 1
fi

# Step 1.2: Database Schema
echo ""
echo "🗄️ Step 1.2: Database Schema Setup"
echo "WHEN: Checking migrations directory"
echo "THEN: All migration files should exist"
MIGRATION_COUNT=$(ls migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "$MIGRATION_COUNT" -eq "5" ]; then
  echo "✅ PASS: All 5 migration files exist"
  ls migrations/*.sql | sed 's/migrations\//  - /'
else
  echo "❌ FAIL: Expected 5 migrations, found $MIGRATION_COUNT"
  exit 1
fi

# Step 1.3: Backend Health Check
echo ""
echo "🚀 Step 1.3: Backend Core Setup"
echo "WHEN: Running 'cd backend && npm start'"
echo "THEN: Health check should respond at http://localhost:3001/health"

# Check if backend is already running
HEALTH_RESPONSE=$(curl -s http://localhost:3001/health 2>/dev/null)
if echo "$HEALTH_RESPONSE" | grep -q "aim-assist-api"; then
  echo "✅ PASS: Health check returns correct response"
  echo "  Response: $HEALTH_RESPONSE"
else
  echo "⚠️  Backend not running, attempting to start..."
  cd backend && node src/index.js &
  BACKEND_PID=$!
  sleep 3
  HEALTH_RESPONSE=$(curl -s http://localhost:3001/health 2>/dev/null)
  if echo "$HEALTH_RESPONSE" | grep -q "aim-assist-api"; then
    echo "✅ PASS: Health check returns correct response"
    echo "  Response: $HEALTH_RESPONSE"
  else
    echo "❌ FAIL: Health check did not return expected response"
    exit 1
  fi
  kill $BACKEND_PID 2>/dev/null
fi

# Summary
echo ""
echo "================================================"
echo "PHASE 1 TEST SUMMARY"
echo "================================================"
echo "✅ Step 1.1: Project Structure - PASS"
echo "✅ Step 1.2: Database Schema - PASS"
echo "✅ Step 1.3: Backend Core - PASS"
echo ""
echo "🎉 All Phase 1 tests passed!"
echo "Ready to proceed to Phase 2: Authentication & Multi-Tenancy"
echo "================================================"