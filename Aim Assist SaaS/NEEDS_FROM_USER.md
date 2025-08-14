# 🔌 Required User Actions for Aim Assist SaaS

This document tracks all the external services, credentials, and configurations that need to be set up by the user to make the Aim Assist SaaS platform fully functional.

## 🔴 Critical (Blocking Development)

### 1. Supabase Setup
**Why**: Database, authentication, and realtime features
**What you need to do**:
1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Get these values from Project Settings > API:
   - `SUPABASE_URL` - Project URL
   - `SUPABASE_ANON_KEY` - Anon/Public key  
   - `SUPABASE_SERVICE_KEY` - Service key (for backend)
4. Run the migration files in Supabase SQL editor
5. Enable Google OAuth in Authentication settings (optional)

**Add to**: `backend/.env` and `frontend/.env`

### 2. Follow Up Boss API Credentials
**Why**: To test the CRM integration with real data
**What you need to do**:
1. Log into Follow Up Boss account
2. Go to Settings > API
3. Create new API key
4. Get these values:
   - `TEST_FUB_API_KEY` - Your API key
   - `TEST_FUB_X_SYSTEM` - Your system name
   - `TEST_FUB_X_SYSTEM_KEY` - Your system key
   - `TEST_FUB_USER_ID` - Your user ID for logging messages

**Add to**: `backend/.env`

## 🟡 Important (Needed Soon)

### 3. Twilio Account
**Why**: SMS messaging functionality
**When needed**: Phase 4 (Lead Management & Messaging)
**What you need to do**:
1. Create account at [twilio.com](https://www.twilio.com)
2. Buy a phone number (or port existing)
3. Get these values:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER` - Your Twilio phone number

**Add to**: `backend/.env`

### 4. Stripe Account
**Why**: Billing and subscriptions
**When needed**: Phase 8 (Billing Integration)
**What you need to do**:
1. Create account at [stripe.com](https://stripe.com)
2. Get test keys from Dashboard:
   - `STRIPE_SECRET_KEY` - Secret key (starts with sk_test_)
   - `STRIPE_PUBLISHABLE_KEY` - Publishable key (starts with pk_test_)
3. Create products and price IDs for plans:
   - Starter plan price ID
   - Growth plan price ID
   - Scale plan price ID
4. Set up webhook endpoint (after deployment)

**Add to**: `backend/.env` and `frontend/.env`

### 5. AI Provider Keys
**Why**: For AI-powered responses
**When needed**: Phase 5 (AI Integration)
**What you need to do**:

**Option A - OpenAI (GPT-4)**:
1. Create account at [platform.openai.com](https://platform.openai.com)
2. Generate API key
3. Add: `OPENAI_API_KEY=sk-...`

**Option B - Anthropic (Claude)**:
1. Create account at [console.anthropic.com](https://console.anthropic.com)
2. Generate API key
3. Add: `ANTHROPIC_API_KEY=sk-ant-...`

**Option C - Google (Gemini)**:
1. Get API key from [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
2. Add: `GEMINI_API_KEY=...`

**Add to**: `backend/.env`

## 🟢 Nice to Have (For Production)

### 6. Redis Instance
**Why**: Message queue persistence
**When needed**: Production deployment
**Options**:
1. Local: Install Redis via Homebrew: `brew install redis`
2. Cloud: Use Redis Cloud, Upstash, or Digital Ocean managed Redis
3. Add connection string: `REDIS_URL=redis://...`

**Add to**: `backend/.env`

### 7. Sentry Account
**Why**: Error tracking in production
**When needed**: Before going live
**What you need to do**:
1. Create account at [sentry.io](https://sentry.io)
2. Create new project
3. Get DSN from project settings
4. Add: `SENTRY_DSN=https://...@....ingest.sentry.io/...`

**Add to**: `backend/.env`

### 8. Digital Ocean Account
**Why**: Hosting the application
**When needed**: Deployment
**What you need to do**:
1. Create account at [digitalocean.com](https://www.digitalocean.com)
2. Set up App Platform
3. Connect GitHub repository
4. Configure environment variables in DO dashboard
5. Set up custom domain (optional)

### 9. Domain Name
**Why**: Professional URL for your SaaS
**When needed**: Before launch
**What you need to do**:
1. Purchase domain (e.g., aimassist.ai)
2. Configure DNS to point to Digital Ocean
3. Set up SSL certificate (automatic with DO)
4. Configure subdomains for tenants

## 📋 Quick Setup Checklist

Copy this to `backend/.env`:

```env
# REQUIRED - Database
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# REQUIRED - For Testing
TEST_FUB_API_KEY=
TEST_FUB_X_SYSTEM=
TEST_FUB_X_SYSTEM_KEY=
TEST_FUB_USER_ID=

# NEEDED SOON - SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# NEEDED SOON - AI (choose one)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# NEEDED LATER - Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# PRODUCTION - Optional
REDIS_URL=
SENTRY_DSN=
```

Copy this to `frontend/.env`:

```env
# REQUIRED
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=

# API Backend
REACT_APP_API_URL=http://localhost:3001/api

# NEEDED LATER
REACT_APP_STRIPE_PUBLISHABLE_KEY=
```

## 🎯 Priority Order

1. **First**: Set up Supabase (can't test multi-tenancy without it)
2. **Second**: Add FUB credentials (to test CRM integration)
3. **Third**: Get at least one AI key (Gemini is free)
4. **Fourth**: Set up Twilio (when ready for SMS)
5. **Fifth**: Configure Stripe (when ready for billing)

## 📝 Notes

- All test credentials can use sandbox/test modes initially
- You can develop with mock data until credentials are ready
- The system will show warnings but won't crash without credentials
- Each phase can be tested independently

---

*Last Updated: January 20, 2025*
*This file will be updated as development continues*