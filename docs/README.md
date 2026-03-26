# Hey / Serv — Documentation

**Serv** is a voice-first roadside assistance coordination app for commercial trucking. It connects fleet users (drivers / fleet managers) with service providers (tire technicians, mechanics) via a conversational AI interface backed by real-time data sync.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 |
| Animation | Motion (Framer Motion v12) |
| AI / LLM | OpenAI GPT-4o (chat + TTS) |
| Database | Supabase (Postgres + Realtime + Auth) |
| PDF | jsPDF + html2canvas |
| Icons | Lucide React |
| Testing | Vitest + React Testing Library |
| Deployment | Cloudflare Pages (via Wrangler) |

## Quick Start

```bash
# 1. Install dependencies (Node >= 20 required)
npm install

# 2. Copy and fill environment variables
cp .env.example .env.local
# Edit .env.local — see docs/config.md for all variables

# 3. Set up Supabase database
# Run supabase-schema.sql in the Supabase SQL editor

# 4. Start dev server
npm run dev            # http://localhost:3000

# 5. Run tests
npm test

# 6. Build & deploy to Cloudflare Pages
npm run deploy
```

## Role-Based Entry Points

The app has two distinct roles, selected at first launch and persisted in `localStorage`:

- **Fleet** — drivers or managers who create service requests via voice/chat
- **Provider** — service technicians who receive, accept, decline, or negotiate requests

## Documentation Index

| File | Description |
|---|---|
| [architecture.md](architecture.md) | System design, data flow, module map |
| [modules/fleet.md](modules/fleet.md) | Fleet-side UI and voice workflow |
| [modules/provider.md](modules/provider.md) | Provider-side UI and voice assistant |
| [modules/services.md](modules/services.md) | Service layer (AI, Supabase, speech, PDF) |
| [modules/voice-ui.md](modules/voice-ui.md) | Voice UI state components |
| [api.md](api.md) | Supabase RPCs and realtime subscriptions |
| [data-model.md](data-model.md) | Database schema and TypeScript types |
| [config.md](config.md) | Environment variables and deployment |
| [decisions.md](decisions.md) | Architectural decisions and trade-offs |

## Repository Layout

```
hey/
├── App.tsx                     # Root — role selector routing
├── index.tsx                   # React entry point
├── types.ts                    # All shared TypeScript types
├── constants.ts                # AI prompts, keywords, defaults
├── components/
│   ├── *.tsx                   # Shared UI components
│   ├── fleet/                  # Fleet-specific screens
│   ├── provider/               # Provider-specific screens
│   └── voice-ui/               # Voice state components (IdleState, etc.)
├── services/
│   ├── aiService.ts            # OpenAI chat + TTS + data extraction
│   ├── coordinationAgentService.ts  # Work-order negotiation agent
│   ├── supabaseService.ts      # All Supabase operations + realtime
│   ├── speechService.ts        # Web Speech API + AudioContext playback
│   ├── pdfService.ts           # Work order PDF generation
│   ├── serviceRequestService.ts # Request creation + validation
│   └── userProfileService.ts   # localStorage profile + role + device ID
├── hooks/
│   ├── useSupabaseAuth.ts      # Anonymous auth + user registration
│   ├── useServiceRequests.ts   # Fleet request list with realtime sync
│   └── useNotifications.ts     # Notification badge, toasts, realtime
├── supabase-schema.sql         # Complete DB schema (run once)
├── supabase/migrations/        # Incremental SQL migrations
├── public/
│   ├── service-worker.js       # PWA service worker
│   └── manifest.json           # Web app manifest
└── figma-export/               # Figma design reference (not production code)
```
