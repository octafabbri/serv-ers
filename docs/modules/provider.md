# Module: Provider

The provider module serves service technicians who receive work orders and respond to them. It has two interfaces: a visual dashboard and a voice-first assistant.

## Entry Point

[components/provider/ProviderApp.tsx](../../components/provider/ProviderApp.tsx) — root orchestrator, ~270 lines.

## Navigation

Four tabs managed by `currentTab: ProviderTab`:

| Tab | Component | Description |
|---|---|---|
| `dashboard` | `ProviderDashboard` | List of available (submitted) work orders |
| `active` | `ActiveJobs` | Orders accepted by this provider |
| `assistant` | `ProviderVoiceAssistant` | Voice-based work order handling |
| `settings` | `ProviderSettings` | Voice persona and language settings |

Default tab on launch is `assistant`.

## Views (Overlays)

Three view overlays sit on top of tabs:

| View | Component | Trigger |
|---|---|---|
| `detail` | `WorkOrderDetail` | Tap on any work order card |
| `counter-propose` | `CounterProposalForm` | "Counter-propose" action in detail view |
| `decline` | `DeclineReasonForm` | "Decline" action in detail view |

## Actions and Supabase Operations

All actions call Supabase RPCs via `supabaseService`:

| Action | RPC / Method | Resulting Status |
|---|---|---|
| Accept request | `accept_service_request` | `accepted` |
| Accept counter-proposal | `approveProposedTime` | `counter_approved` |
| Decline | `decline_service_request` | `rejected` |
| Counter-propose | `proposeNewTime` | `counter_proposed` |
| Complete job | `complete_service_request` | `completed` |

## Voice Assistant (`ProviderVoiceAssistant`)

[components/provider/ProviderVoiceAssistant.tsx](../../components/provider/ProviderVoiceAssistant.tsx)

The provider voice assistant is the primary interface. It:

1. **Fetches** all `submitted` and `counter_proposed` work orders from Supabase on mount
2. **Subscribes** to `service_requests` realtime changes (all events) to catch new inbound orders
3. **Announces** new orders via TTS (brief summary on first detection, using `sessionStorage` to avoid re-announcing)
4. **Listens** for voice commands: "accept", "decline [reason]", "counter [date/time]", "next", "back", "summary"

### Voice FSM

```
idle
  └──► tap/start ──► listening
                         └──► silence (1500ms) ──► processing
                                                       └──► responding
                                                              └──► idle
```

`awaitingContext` refines the listening mode:

| Context | Expects |
|---|---|
| `command` | accept / decline / counter / next / back / summary |
| `decline-reason` | free-form reason text |
| `counter-date` | natural language date |
| `counter-time` | natural language time |
| `counter-confirm` | yes / confirm / no / change |

### Work Order Coordination Agent

`WorkOrderCoordinationAgent` (from `coordinationAgentService`) is instantiated per active request. It:
- Receives the full work order context in its system prompt
- Answers factual questions ("what's the tire size?") concisely
- Provides a spoken summary when asked
- The app interprets voice commands independently — the agent does not issue Supabase calls directly

### Date/Time Parsing

For counter-proposals, the provider says something like "let's do Monday at nine". The flow is:

1. `extractProposedDateTime()` — AI-powered (GPT-4o, temperature=0) parses intent, handles negations
2. Falls back to `extractDateTime()` — regex-based heuristic parser
3. Combined into ISO datetime string passed to `proposeNewTime()`

## Key Components

| Component | Description |
|---|---|
| [ProviderApp.tsx](../../components/provider/ProviderApp.tsx) | Root with all action handlers |
| [ProviderDashboard.tsx](../../components/provider/ProviderDashboard.tsx) | Available work orders list |
| [ProviderVoiceAssistant.tsx](../../components/provider/ProviderVoiceAssistant.tsx) | Voice interface |
| [ActiveJobs.tsx](../../components/provider/ActiveJobs.tsx) | Accepted/in-progress jobs |
| [WorkOrderCard.tsx](../../components/provider/WorkOrderCard.tsx) | Card in the dashboard list |
| [WorkOrderDetail.tsx](../../components/provider/WorkOrderDetail.tsx) | Full work order detail view |
| [CounterProposalForm.tsx](../../components/provider/CounterProposalForm.tsx) | Date/time form for counter-proposal |
| [DeclineReasonForm.tsx](../../components/provider/DeclineReasonForm.tsx) | Optional reason text for decline |
| [ProviderSettings.tsx](../../components/provider/ProviderSettings.tsx) | Voice persona + language picker |

## Voice Settings

Stored in `localStorage` under `provider_voice_settings`:

```ts
{ voiceURI: string; language: string }
```

Default voice: `onyx`. Available voices: all six OpenAI TTS voices (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`).

## Notifications

`useNotifications(userId, 'provider')` provides:
- `unreadCount` — badge on the bottom menu bar
- `activeToast` — 5-second overlay toast for incoming events (new request, fleet counter-proposal, etc.)

Provider notifications come entirely from the `service_request_notifications` table (server-side), not from request status polling.

## Session Storage

`ProviderVoiceAssistant` uses `sessionStorage` for two sets:
- `provider_seen_requests` — IDs presented to the FSM at least once
- `provider_announced_ids` — IDs for which a brief TTS announcement was played

This prevents re-announcing on tab revisit within the same browser session.
