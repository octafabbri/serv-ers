# Module: Fleet

The fleet module is the largest part of the app. It handles the driver/fleet-manager experience: creating service requests via voice or chat, monitoring status, and negotiating schedules.

## Entry Point

[components/fleet/FleetApp.tsx](../../components/fleet/FleetApp.tsx) — ~600+ lines. Holds essentially all fleet state and orchestrates voice recognition, AI sessions, Supabase interactions, and navigation.

## Navigation

Three tabs managed by `currentTab: NavigationTab`:

| Tab | Component | Description |
|---|---|---|
| `home` | Voice UI / ChatInterface | Main assistant interface |
| `notifications` | `NotificationsView` | Counter-proposals and status updates |
| `settings` | `SettingsPage` | Profile, voice settings, work order history |

## Input Modes

`inputMode: 'voice' | 'chat'` — toggled by `InputModeToggle`. Both modes share the same message history (`messages: ChatMessage[]`).

- **Voice**: Web Speech API (`getSpeechRecognition`) for STT → OpenAI TTS for response playback
- **Chat**: Text input via `ChatInterface`, same AI pipeline minus audio

## Voice Assistant States

Driven by `assistantState: AssistantState` derived from underlying flags:

```
isListening → listening
isLoadingAI → processing
isSpeaking  → responding (or urgent if ERS)
completedServiceRequest → pdf-ready
```

Each state renders a dedicated component from `components/voice-ui/`. See [voice-ui.md](voice-ui.md).

## Service Request Workflow

### 1. Detection
`determineTaskFromInput()` scans user input against `SERVICE_REQUEST_KEYWORDS`. On match, `AssistantTask.SERVICE_REQUEST` is activated.

### 2. Collection
A `ChatSession` is created with the `SERVICE_REQUEST` system prompt (persona "Serv"). The AI collects all required fields conversationally. Field completeness is checked by `validateServiceRequest()`.

### 3. Confirmation
When all required fields are populated (checked after each AI turn), `isAwaitingConfirmation` is set. A spoken summary is generated via `buildConfirmationSummary()`. The user says "yes/confirm" or "no/change".

### 4. Submission
On confirmation:
- PDF work order is generated via `pdfService.generateServiceRequestPDF()`
- Request is submitted to Supabase via `supabaseService.submitServiceRequest()`
- State transitions to `pdf-ready`

### 5. Negotiation
After submission, if a provider counter-proposes, the fleet user receives a notification. They can:
- **Approve** — via `approveProposedTime()` RPC
- **Reject** — via `rejectProposedTime()` RPC (returns to `submitted`)
- **Counter-propose** — via `FleetCounterProposalForm` or voice commands

## Voice-Based Counter-Proposal Review

`voiceReviewRequest` / `awaitingVoiceCtx` implement a voice FSM for handling counter-proposals hands-free:

```
command ──► accept/decline/counter
counter ──► counter-date ──► counter-time ──► counter-confirm ──► send
decline ──► decline-reason ──► send
```

Natural language date/time extraction is handled by `extractProposedDateTime()` (AI-powered with FSM fallback).

## Wellness Check-In

Activated by keywords from `WELLNESS_CHECKIN_KEYWORDS`. Asks three questions sequentially (mood rating, stress level, optional notes) and saves a `MoodEntry` to the user profile in `localStorage`.

## Key Components

| Component | Description |
|---|---|
| [FleetApp.tsx](../../components/fleet/FleetApp.tsx) | Root orchestrator |
| [NotificationsView.tsx](../../components/fleet/NotificationsView.tsx) | Lists counter-proposals and accepted/rejected requests |
| [NotificationBanner.tsx](../../components/fleet/NotificationBanner.tsx) | In-app banner for pending counter-proposals |
| [CounterProposalReview.tsx](../../components/fleet/CounterProposalReview.tsx) | UI to approve/reject a counter-proposal |
| [FleetCounterProposalForm.tsx](../../components/fleet/FleetCounterProposalForm.tsx) | Form to submit a fleet-originated counter-proposal |
| [RequestDetailModal.tsx](../../components/fleet/RequestDetailModal.tsx) | Modal showing full request details |
| [WorkOrderHistory.tsx](../../components/fleet/WorkOrderHistory.tsx) | History list in settings tab |

## Shared Components Used

| Component | File | Purpose |
|---|---|---|
| `BottomMenuBar` | [components/BottomMenuBar.tsx](../../components/BottomMenuBar.tsx) | Tab bar with notification badge |
| `ChatInterface` | [components/ChatInterface.tsx](../../components/ChatInterface.tsx) | Text chat UI |
| `ChatMessage` | [components/ChatMessage.tsx](../../components/ChatMessage.tsx) | Single message bubble |
| `InputModeToggle` | [components/InputModeToggle.tsx](../../components/InputModeToggle.tsx) | Voice/chat switch |
| `SettingsPage` | [components/SettingsPage.tsx](../../components/SettingsPage.tsx) | Full settings screen |
| `SettingsModal` | [components/SettingsModal.tsx](../../components/SettingsModal.tsx) | Settings overlay |
| `NotificationToast` | [components/NotificationToast.tsx](../../components/NotificationToast.tsx) | 5s toast for incoming events |
| `Modal` | [components/Modal.tsx](../../components/Modal.tsx) | Generic modal wrapper |
| `RoleSelector` | [components/RoleSelector.tsx](../../components/RoleSelector.tsx) | Initial role picker |
| `StatusBadge` | [components/StatusBadge.tsx](../../components/StatusBadge.tsx) | Colored status chip |

## Hooks Used

- `useSupabaseAuth` — ensures anonymous session; `supabaseUserId` is used as `created_by_id`
- `useNotifications(userId, 'fleet')` — fetches counter-proposed/accepted/rejected requests; drives unread badge and toast
- `useServiceRequests(userId)` — fetches all fleet-created requests; updates on realtime changes

## State Management Notes

`FleetApp` is a large component (~600 lines) with extensive ref mirroring. Many `useEffect` hooks keep `useRef` values in sync with corresponding state values to avoid stale closures in async speech callbacks.

The speech queue (`speechQueueRef`) serialises concurrent TTS calls so they play one after another without overlap.
