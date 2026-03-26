# Hey — AI Dispatcher for Commercial Trucking

A voice-first AI dispatching platform for emergency roadside assistance. Built with React + TypeScript, powered by OpenAI and backed by Supabase.

Two personas share the platform:

- **Fleet** — drivers report breakdowns via voice or chat; the AI collects all dispatch details and generates a PDF work order
- **Service Provider** — technicians review incoming work orders, accept/decline/counter-propose via a voice assistant, and manage active jobs

---

## Features

### Fleet (Driver Side)
- Voice-first conversational intake — AI collects driver name, location, vehicle, service type, urgency
- Per-service-type validation: TIRE (size, quantity, position) vs. MECHANICAL (service type, description)
- Urgency classification: ERS (emergency), DELAYED, SCHEDULED (with date + time)
- Confirmation flow with PDF work order generation (urgency-color-coded)
- Voice counter-proposal review — hear provider responses and accept/decline/counter by voice
- Realtime notifications when a provider responds

### Service Provider Side
- Voice assistant tab — hear incoming work orders read aloud, act by voice
- Natural-language commands: "accept", "decline", "counter for next Wednesday at 3"
- Q&A mid-workflow: ask about address, phone, tire details without losing context
- Active Jobs view for tracking accepted work
- Realtime notifications when a fleet user responds to a counter-proposal

### Shared
- Supabase backend with SECURITY DEFINER RPCs and row-level security
- Multi-round negotiation: counter-proposals can go back and forth between roles
- Realtime updates via Supabase postgres_changes subscriptions
- Role-aware notification system — each party only sees their own alerts
- Multi-language support (English, Spanish, French, German)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| AI (chat + extraction) | OpenAI GPT-4o |
| AI (text-to-speech) | OpenAI TTS (`tts-1`) with retry on 503/429 |
| Voice input | Web Speech API (browser-native) |
| Backend / database | Supabase (Postgres + Realtime + RLS) |
| PDF generation | jsPDF + html2canvas |
| Animations | Motion (Framer Motion) |
| Icons | Lucide React |
| Testing | Vitest + React Testing Library |
| Deployment | Cloudflare Pages (Wrangler) |

---

## Prerequisites

- **Node.js ≥ 20** (pinned in `.node-version`)
- An **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- A **Supabase project** — [supabase.com/dashboard](https://supabase.com/dashboard)

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/octafabbri/hey.git
cd hey
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_OPENAI_API_KEY=sk-your-key-here
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

> `.env.local` is gitignored — your keys will never be committed.

### 3. Set up the Supabase database

In the Supabase SQL editor, run in order:

1. `supabase-schema.sql` — creates all tables, RLS policies, and core RPCs
2. `supabase/migrations/20260213_add_scheduling_workflow_columns.sql`
3. `supabase/migrations/20260213_accept_decline_functions.sql`
4. `supabase/migrations/20260213_propose_new_time.sql`
5. `supabase/migrations/20260213_rls_proposal_workflow.sql`
6. `supabase/migrations/20260213_rpc_security_fixes.sql`
7. `supabase/migrations/20260213_fleet_proposal_rpcs.sql`
8. `supabase/migrations/20260228_complete_job.sql`

> If starting fresh, `supabase-schema.sql` already includes the latest combined schema. The migration files are kept for reference and incremental updates.

### 4. Start the dev server

```bash
npm run dev
```

App runs at http://localhost:3000

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once and exit |
| `npm run test:ui` | Vitest UI dashboard |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run deploy` | Build and deploy to Cloudflare Pages (production) |
| `npm run deploy:preview` | Build and deploy a preview branch |

---

## Deploying to Cloudflare Pages

### First-time setup

```bash
npx wrangler login
npm run deploy   # Wrangler will prompt to create the Pages project
```

### Environment variables

Add all three variables in the Cloudflare dashboard under **Pages → Settings → Environment variables** (set for both Production and Preview), or via CLI:

```bash
npx wrangler pages secret put VITE_OPENAI_API_KEY
npx wrangler pages secret put VITE_SUPABASE_URL
npx wrangler pages secret put VITE_SUPABASE_ANON_KEY
```

> Use a separate Supabase project for production vs. development to keep test data isolated.

### Subsequent deploys

```bash
npm run deploy
```

---

## Project Structure

```
hey/
├── App.tsx                        # Root — role selector, routes to FleetApp or ProviderApp
├── constants.ts                   # AI system prompts, task keywords, voice configs
├── types.ts                       # TypeScript interfaces (ServiceRequest, ProposalEntry, etc.)
├── index.tsx                      # React entry point
├── supabase-schema.sql            # Full DB schema (tables, RLS, RPCs)
│
├── components/
│   ├── BottomMenuBar.tsx          # iOS-style tab bar (role-aware tabs)
│   ├── NotificationToast.tsx      # Slide-in realtime alert banner
│   ├── RoleSelector.tsx           # Fleet / Provider onboarding screen
│   ├── SettingsPage.tsx           # Voice persona + language settings
│   ├── ChatInterface.tsx          # iMessage-style chat UI
│   │
│   ├── fleet/
│   │   ├── FleetApp.tsx           # Fleet root — voice assistant + navigation
│   │   ├── WorkOrderHistory.tsx   # List of submitted requests + status
│   │   ├── NotificationsView.tsx  # Notification history panel
│   │   ├── NotificationBanner.tsx # Inline notification list component
│   │   ├── CounterProposalReview.tsx    # Review incoming counter-proposals
│   │   ├── FleetCounterProposalForm.tsx # Fleet counter-proposal form
│   │   └── RequestDetailModal.tsx       # Full work order detail overlay
│   │
│   ├── provider/
│   │   ├── ProviderApp.tsx           # Provider root — tab router
│   │   ├── ProviderDashboard.tsx     # Incoming work order list
│   │   ├── ProviderVoiceAssistant.tsx  # Voice assistant tab (orb UI)
│   │   ├── ActiveJobs.tsx            # Accepted jobs in progress
│   │   ├── WorkOrderCard.tsx         # Work order list card
│   │   ├── WorkOrderDetail.tsx       # Full work order detail view
│   │   ├── CounterProposalForm.tsx   # Counter-propose date/time form
│   │   ├── DeclineReasonForm.tsx     # Decline with optional reason form
│   │   └── ProviderSettings.tsx      # Provider voice + account settings
│   │
│   └── voice-ui/                  # Fleet voice state components
│       ├── IdleState.tsx
│       ├── ListeningState.tsx
│       ├── ProcessingState.tsx
│       ├── RespondingState.tsx
│       ├── UrgentResponseState.tsx
│       ├── PDFGeneratingState.tsx
│       ├── PDFReadyState.tsx
│       └── ResolutionState.tsx
│
├── hooks/
│   ├── useNotifications.ts        # Realtime notification state + toast (role-aware)
│   ├── useServiceRequests.ts      # Fleet request list + realtime subscription
│   └── useSupabaseAuth.ts         # Anonymous auth + user registration
│
├── services/
│   ├── aiService.ts               # OpenAI chat sessions, TTS (with 503/429 retry), extraction
│   ├── coordinationAgentService.ts  # WorkOrderCoordinationAgent — role-aware negotiation AI
│   ├── supabaseService.ts         # All Supabase queries, RPCs, realtime subscriptions
│   ├── speechService.ts           # Web Speech API + AudioContext MP3 playback
│   ├── pdfService.ts              # PDF work order generation
│   ├── serviceRequestService.ts   # Validation + merge helpers for service requests
│   └── userProfileService.ts      # localStorage profile management
│
└── supabase/
    └── migrations/                # Incremental SQL migrations
```

---

## Service Request Data Model

| Layer | Required Fields |
|-------|----------------|
| **Base (all)** | driver_name, contact_phone, fleet_name, location, vehicle_type, service_type, urgency |
| **+ TIRE** | requested_service (REPLACE/REPAIR), requested_tire (size), number_of_tires, tire_position |
| **+ MECHANICAL** | requested_service, description |
| **+ SCHEDULED** | scheduled_date, scheduled_time |

### Status lifecycle

```
submitted → counter_proposed ⇄ counter_proposed → counter_approved
          ↘ accepted
          ↘ rejected
counter_approved → completed
```

---

## Testing

```bash
npm run test:run    # Run all tests once
```

Test suites:
- `services/serviceRequestService.test.ts` — validation for all service type + urgency combinations
- `services/userProfileService.test.ts` — profile CRUD
- `components/SettingsPage.test.tsx` — settings component

See [TEST_README.md](TEST_README.md) for the full testing guide.
