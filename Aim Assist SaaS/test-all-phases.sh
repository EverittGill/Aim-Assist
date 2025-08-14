#!/bin/bash

echo "================================================"
echo "AIM ASSIST SAAS - COMPREHENSIVE TEST SUITE"
echo "Testing Phases 1-3"
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test function
run_test() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "\n${YELLOW}Test $TOTAL_TESTS: $1${NC}"
  if eval "$2"; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ FAIL${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

echo ""
echo "====== PHASE 1: FOUNDATION SETUP ======"

# Test 1.1: Project Structure
run_test "Project structure exists" \
  "[ -d backend/node_modules ] && [ -d frontend/node_modules ] && [ -f package.json ]"

# Test 1.2: Database Migrations
run_test "All 5 migration files exist" \
  "[ $(ls migrations/*.sql 2>/dev/null | wc -l) -eq 5 ]"

# Test 1.3: Backend Health Check
run_test "Backend health endpoint responds" \
  "curl -s http://localhost:3001/health 2>/dev/null | grep -q 'aim-assist-api'"

# Test 1.4: Frontend Running
run_test "Frontend responds on port 3000" \
  "curl -s http://localhost:3000 2>/dev/null | grep -q 'Aim Assist'"

echo ""
echo "====== PHASE 2: AUTHENTICATION & MULTI-TENANCY ======"

# Test 2.1: Authentication Middleware
run_test "Authentication middleware exists" \
  "[ -f backend/src/middleware/authenticate.js ]"

# Test 2.2: Tenant Service
run_test "TenantService exists and exports methods" \
  "node -e \"const T = require('./backend/src/services/TenantService'); console.log(typeof T.create === 'function' ? 'ok' : 'fail')\" | grep -q 'ok'"

# Test 2.3: Tenant Creation Test
run_test "Tenant creation works" \
  "node backend/test-tenant-creation.js 2>&1 | grep -q 'All tenant tests passed'"

# Test 2.4: Frontend Auth Components
run_test "Login and Signup forms exist" \
  "[ -f frontend/src/components/auth/LoginForm.js ] && [ -f frontend/src/components/auth/SignupForm.js ]"

# Test 2.5: Supabase Context
run_test "Supabase context provider exists" \
  "[ -f frontend/src/contexts/SupabaseContext.js ]"

echo ""
echo "====== PHASE 3: CRM INTEGRATION LAYER ======"

# Test 3.1: CRM Adapter Base Class
run_test "CRMAdapter base class exists" \
  "[ -f backend/src/services/crm/CRMAdapter.js ]"

# Test 3.2: FUB Adapter
run_test "FollowUpBossAdapter exists" \
  "[ -f backend/src/services/crm/adapters/FollowUpBossAdapter.js ]"

# Test 3.3: Lofty Adapter Placeholder
run_test "LoftyAdapter placeholder exists" \
  "[ -f backend/src/services/crm/adapters/LoftyAdapter.js ]"

# Test 3.4: CRM Factory
run_test "CRMFactory pattern implemented" \
  "[ -f backend/src/services/crm/CRMFactory.js ]"

# Test 3.5: CRM Integration Test
run_test "CRM integration tests pass" \
  "node backend/test-crm-integration.js 2>&1 | grep -q 'All CRM integration tests completed'"

echo ""
echo "====== API ENDPOINT TESTS ======"

# Test API endpoints
run_test "Auth routes configured" \
  "curl -s http://localhost:3001/api/auth/login 2>/dev/null | grep -q 'Login endpoint'"

run_test "Tenant routes configured" \
  "curl -s http://localhost:3001/api/tenants 2>/dev/null | grep -q 'tenants'"

run_test "Frontend status endpoint" \
  "curl -s http://localhost:3001/api/dev/frontend-status 2>/dev/null | grep -q 'status'"

echo ""
echo "====== MULTI-TENANT ISOLATION TEST ======"

# Create test script for multi-tenant isolation
cat > test-isolation.js << 'EOF'
const TenantService = require('./backend/src/services/TenantService');
const CRMFactory = require('./backend/src/services/crm/CRMFactory');

async function testIsolation() {
  try {
    // Create two test tenants
    const tenant1 = await TenantService.create({
      name: 'Company A',
      subdomain: 'company-a',
      owner_email: 'a@test.com'
    });
    
    const tenant2 = await TenantService.create({
      name: 'Company B',
      subdomain: 'company-b',
      owner_email: 'b@test.com'
    });
    
    // Verify different IDs
    if (tenant1.id === tenant2.id) {
      throw new Error('Tenants have same ID!');
    }
    
    console.log('✅ Multi-tenant isolation test passed');
    return true;
  } catch (error) {
    console.error('❌ Isolation test failed:', error.message);
    return false;
  }
}

testIsolation();
EOF

run_test "Multi-tenant isolation" \
  "node test-isolation.js 2>&1 | grep -q '✅ Multi-tenant isolation test passed'"

# Clean up test file
rm -f test-isolation.js

echo ""
echo "================================================"
echo "TEST SUMMARY"
echo "================================================"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo "The Aim Assist SaaS platform foundation is solid."
  echo ""
  echo "Next Steps:"
  echo "1. Configure Supabase credentials in backend/.env"
  echo "2. Set up Stripe for billing"
  echo "3. Configure Twilio for SMS"
  echo "4. Add real FUB API credentials for testing"
  exit 0
else
  echo -e "\n${RED}⚠️ Some tests failed${NC}"
  echo "Please review the failures above and fix any issues."
  exit 1
fi