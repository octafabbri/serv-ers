# Module: Services

All backend-facing logic lives in `services/`. No Express server — services are plain TypeScript modules called directly from components and hooks.

---

## aiService.ts

[services/aiService.ts](../../services/aiService.ts)

Wraps OpenAI's Node SDK (`openai` package, `dangerouslyAllowBrowser: true`).

### `ChatSession` class

A stateful wrapper around the OpenAI Chat API that maintains conversation history:

```ts
const session = new ChatSession(systemPrompt, temperature);
const { text } = await session.sendMessage({ message: 'Hello' });
```

Messages accumulate in `this.messages` (system + user + assistant turns). Each call posts the full history to `gpt-4o`.

### Key exports

| Export | Description |
|---|---|
| `ChatSession` | Stateful multi-turn chat |
| `createNewChatWithTask(task, lang, name)` | Creates a `ChatSession` with a task-specific system prompt from `constants.ts` |
| `generateSpeech(text, voiceName)` | Calls `tts-1`, returns base64 MP3. Retries up to 3× on 503/429. |
| `extractServiceDataFromConversation(transcript, current)` | Structured extraction from conversation history → `Partial<ServiceRequest>`. Uses `json_object` response format. |
| `extractNameWithAI(input)` | Extracts a name from freeform input, falls back to `"Driver"` |
| `determineTaskFromInput(input)` | Keyword matching → `AssistantTask` |
| `parseJsonFromString<T>(str)` | JSON parse with markdown fence stripping |
| `resolveScheduledDate(str)` | Normalises day names / "tomorrow" → `YYYY-MM-DD` |

---

## coordinationAgentService.ts

[services/coordinationAgentService.ts](../../services/coordinationAgentService.ts)

Manages the work-order negotiation agent used by both `ProviderVoiceAssistant` and `FleetApp`.

### `WorkOrderCoordinationAgent` class

```ts
const agent = new WorkOrderCoordinationAgent(request, 'service_provider', 'Alice', allRequests);
const summary = await agent.getRequestSummary();
const reply = await agent.sendMessage('What tire size?');
```

On construction, a detailed system prompt is built that includes:
- Caller role and name
- Full work order details (service type, urgency, location, vehicle, tire/mechanical info)
- Proposal negotiation history
- (Provider only) list of all pending work orders

The agent is instructed to respond conversationally without bullet points, as if speaking on the phone.

### Date/Time Utilities

| Export | Description |
|---|---|
| `parseNaturalDate(input)` | `"monday"` / `"tomorrow"` / `"March 5"` → `YYYY-MM-DD` |
| `parseTimeString(input)` | `"2pm"` / `"14:30"` → `HH:MM` (24h) |
| `extractDateTime(input)` | Regex extraction of date+time from free text |
| `extractProposedDateTime(input)` | AI-powered extraction (understands negations); falls back to `extractDateTime` |

---

## supabaseService.ts

[services/supabaseService.ts](../../services/supabaseService.ts)

All database operations. Client is lazily initialised from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Auth

| Export | Description |
|---|---|
| `signInAnonymously()` | Supabase anonymous sign-in; returns `userId` |
| `getSessionUserId()` | Returns current session's `auth.uid()` |
| `isSupabaseConfigured()` | Guard for missing env vars |

### Users

| Export | Description |
|---|---|
| `registerUser(deviceId, role, name, ...)` | Upserts user row (conflict on `device_id`) |
| `getUser(deviceId)` | Fetch user by device ID |

### Service Requests

| Export | Description |
|---|---|
| `submitServiceRequest(request)` | Insert new request with status `submitted` |
| `getServiceRequests(filters?)` | Fetch with optional `status`, `urgency`, `createdBy` filters. Batch-resolves `last_updated_by` user info. |
| `getServiceRequest(id)` | Single request with resolved `last_updated_by` |
| `acceptServiceRequest(id)` | Calls `accept_service_request` RPC |
| `rejectServiceRequest(id, reason?)` | Calls `decline_service_request` RPC |
| `proposeNewTime(requestId, datetime, notes?)` | Calls `propose_new_time` RPC |
| `approveProposedTime(requestId)` | Calls `approve_proposed_time` RPC |
| `rejectProposedTime(requestId, reason?)` | Calls `reject_proposed_time` RPC |
| `completeServiceRequest(requestId)` | Calls `complete_service_request` RPC |

### Counter Proposals (legacy)

`createCounterProposal`, `getCounterProposals`, `approveCounterProposal`, `rejectCounterProposal` — direct table mutations. These predate the RPC-based `propose_new_time` workflow and are still present but largely superseded.

### Realtime Subscriptions

| Export | Returns | Listens to |
|---|---|---|
| `subscribeToServiceRequests(cb)` | `RealtimeChannel` | All events on `service_requests` |
| `subscribeToMyRequests(userId, cb)` | `RealtimeChannel` | UPDATE on `service_requests` where `created_by_id = userId` |
| `subscribeToCounterProposals(ids, cb)` | `RealtimeChannel` | All events on `counter_proposals` |
| `subscribeToNotifications(userId, cb)` | `RealtimeChannel` | INSERT on `service_request_notifications` where `recipient_id = userId` |
| `unsubscribe(channel)` | `void` | Removes channel |

### Notifications

| Export | Description |
|---|---|
| `getNotifications(unreadOnly?)` | Fetch from `service_request_notifications` |
| `markNotificationRead(id)` | Sets `read_at = now()` |
| `markAllNotificationsRead()` | Marks all unread for current user |

---

## speechService.ts

[services/speechService.ts](../../services/speechService.ts)

Browser audio I/O.

### Speech Recognition (Input)

`getSpeechRecognition()` — returns a `SpeechRecognition` instance (or `null` if unsupported). The caller configures `continuous`, `interimResults`, `lang`, etc. This uses the browser's built-in Web Speech API.

### Audio Playback (Output)

Manages a shared `AudioContext` and a `currentSource: AudioBufferSourceNode` for sequential MP3 playback.

| Export | Description |
|---|---|
| `initializeAudio()` | Resumes `AudioContext` (must be called in a user gesture) |
| `playAudioContent(base64, volume, onEnd?)` | Decodes MP3 base64 → AudioBuffer → plays via `AudioBufferSourceNode` |
| `stopAudioPlayback()` | Stops currently playing audio |

The base64 → ArrayBuffer conversion uses chunked processing (32KB chunks) to avoid stack overflow on large responses.

---

## pdfService.ts

[services/pdfService.ts](../../services/pdfService.ts)

Generates a printable work order PDF.

| Export | Description |
|---|---|
| `generateServiceRequestPDF(request)` | Renders HTML template off-screen, captures via `html2canvas` (2× scale), converts to A4 PDF via `jsPDF`. Returns a `Blob`. |
| `downloadPDF(blob, filename)` | Creates a temporary object URL and triggers browser download |

The HTML template (`renderPDFHTML`) produces a bordered work order with color-coded urgency banners (red=ERS, orange=DELAYED, green=SCHEDULED) and optional conversation transcript section.

---

## serviceRequestService.ts

[services/serviceRequestService.ts](../../services/serviceRequestService.ts)

Pure functions for service request management (no network calls).

| Export | Description |
|---|---|
| `createServiceRequest()` | Creates a new `draft` request with a UUID |
| `validateServiceRequest(request)` | Returns `{ isComplete, missingFields[] }`. Validates base + type-specific + urgency-specific fields. |
| `addServiceRequest(profile, request)` | Appends request to `UserProfile.serviceRequests` |
| `updateServiceRequest(profile, id, updates)` | Patch request in profile by ID |

---

## userProfileService.ts

[services/userProfileService.ts](../../services/userProfileService.ts)

`localStorage` persistence for user profile and role.

| Export | Description |
|---|---|
| `loadUserProfile()` | Deserialises profile from `localStorage`; merges with defaults |
| `saveUserProfile(profile)` | Serialises to `localStorage` |
| `getDeviceId()` | Returns existing device UUID or generates and stores one |
| `getUserRole()` | Returns `'fleet' \| 'provider' \| null` |
| `setUserRole(role)` | Persists role to `localStorage` |
| `clearUserRole()` | Removes role (triggers role selector on next render) |
| `addMoodEntry(profile, entry)` | Appends `MoodEntry` to profile |

Storage keys (from `constants.ts`):
- `servUserProfile`
- `servUserRole`
- `servDeviceId`
