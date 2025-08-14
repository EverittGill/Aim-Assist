# Aim Assist SaaS Platform

Multi-tenant AI-powered sales assistant platform with CRM integration and automated lead nurturing.

## Features
- 🏢 Multi-tenant architecture with complete data isolation
- 🤝 Multiple CRM support (Follow Up Boss, Lofty, more coming)
- 🤖 AI-powered conversation management (Claude, Gemini, GPT-4)
- 📱 Automated SMS outreach with configurable delays
- 💳 Stripe billing integration with usage tracking
- 🌊 Beach Mode UI for maximum sunlight readability

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Run development servers (frontend + backend)
npm run dev

# Run tests
npm test
```

## Project Structure
```
Aim Assist SaaS/
├── frontend/           # React UI (port 3000)
├── backend/            # Express API (port 3001)
├── shared/             # Shared types and constants
├── migrations/         # Supabase database migrations
├── tests/              # Integration tests
└── .do/                # Digital Ocean deployment config
```

## Environment Setup

1. Copy `.env.example` files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Configure required services:
- Supabase (auth + database)
- Stripe (billing)
- Twilio (SMS)
- AI providers (Claude/Gemini/OpenAI)
- CRM credentials

## Development

See `SaaS_SPRINT_1.md` for implementation plan and test criteria.

## Testing

Multi-tenant isolation is critical:
```bash
npm run test:isolation
```

## Deployment

Digital Ocean App Platform configuration in `.do/app.yaml`