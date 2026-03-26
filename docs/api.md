# API Reference

There is no custom backend. All server-side logic is expressed as Supabase Postgres functions (RPCs) and Row Level Security policies.

## Supabase RPCs

All RPCs are called via `supabase.rpc(name, params)` and are `SECURITY DEFINER` — they run with elevated privileges and enforce their own authorization checks.

---

### `accept_service_request`

**Caller role**: `provider`
**Parameters**: `p_request_id UUID`
**Returns**: `SETOF service_requests`

Transitions a request from `submitted` or `counter_proposed` → `accepted`. Sets `assigned_provider_id`, `accepted_at`, `last_updated_by`. Inserts a `request_accepted` notification to the fleet user.

**Errors**:
- `Only service providers can accept requests`
- `Service request not found`
- `Cannot accept request with status "X". Must be "submitted" or "counter_proposed".`
- `This request is assigned to another provider`

---

### `decline_service_request`

**Caller role**: `provider`
**Parameters**: `p_request_id UUID`, `p_reason TEXT DEFAULT NULL`
**Returns**: `SETOF service_requests`

Transitions from `submitted` or `counter_proposed` → `rejected`. Clears `assigned_provider_id`. Inserts a `request_declined` notification.

**Errors**:
- `Only service providers can decline requests`
- `Cannot decline request with status "X"`
- `Only the assigned provider can decline this request`

---

### `propose_new_time`

**Caller role**: `fleet` or `provider`
**Parameters**: `p_request_id UUID`, `p_new_proposed_date TIMESTAMPTZ`, `p_notes TEXT DEFAULT NULL`
**Returns**: `SETOF service_requests`

Used by **both** roles for multi-round negotiation:
- **Provider**: can propose on `submitted` or `counter_proposed` requests → status remains/becomes `counter_proposed`
- **Fleet**: can propose only on `counter_proposed` requests → status stays `counter_proposed`

Appends a `ProposalEntry` JSON object to `proposal_history`, sets `proposed_date`, `last_updated_by`. Inserts a `counter_proposed` notification to the other party.

---

### `approve_proposed_time`

**Caller role**: `fleet`
**Parameters**: `p_request_id UUID`
**Returns**: `SETOF service_requests`

Transitions `counter_proposed` → `counter_approved`. Copies `proposed_date` into `scheduled_date` / `scheduled_time`. Inserts a `counter_approved` notification to the provider.

**Errors**:
- `Only fleet users can approve proposed times`
- `Can only approve counter-proposed requests`
- `Only the request creator can approve a proposed time`

---

### `reject_proposed_time`

**Caller role**: `fleet`
**Parameters**: `p_request_id UUID`, `p_reason TEXT DEFAULT NULL`
**Returns**: `SETOF service_requests`

Transitions `counter_proposed` → `submitted` (back to open pool). Clears `assigned_provider_id`, `proposed_date`. Inserts a `counter_rejected` notification.

---

### `complete_service_request`

**Caller role**: `provider` (inferred from context — exact role check is in the migration file, not the combined schema)
**Parameters**: `p_request_id UUID`
**Returns**: `SETOF service_requests`

Transitions → `completed`. Sets `completed_at`.

See [supabase/migrations/20260228_complete_job.sql](../supabase/migrations/20260228_complete_job.sql) for the full implementation.

---

### `get_user_role`

**Parameters**: none
**Returns**: `TEXT` (`fleet` | `provider`)

Helper used inside RLS policies to get the calling user's role. `SECURITY DEFINER STABLE`.

---

## Supabase Realtime Channels

See [architecture.md](architecture.md#real-time-architecture) for the channel map. Realtime is enabled for:
- `service_requests`
- `counter_proposals`
- `service_request_notifications`

---

## OpenAI API Calls

All calls go through `services/aiService.ts`. The base URL is OpenAI's default.

| Endpoint | Model | Use case |
|---|---|---|
| `POST /chat/completions` | `gpt-4o` | Conversational dispatch (fleet) |
| `POST /chat/completions` | `gpt-4o` | Structured extraction (`response_format: json_object`) |
| `POST /chat/completions` | `gpt-4o` | Coordination agent (provider) |
| `POST /chat/completions` | `gpt-4o` | Name extraction, date/time parsing |
| `POST /audio/speech` | `tts-1` | Text-to-speech (MP3) |

The OpenAI client is called directly from the browser. The API key is exposed in the browser environment (see [decisions.md](decisions.md)).

---

## Notification Event Types

The `event_type` column in `service_request_notifications` uses these values:

| Event | Trigger | Recipient |
|---|---|---|
| `request_submitted` | Fleet submits a new request | (not currently used in RPCs) |
| `request_accepted` | Provider accepts | Fleet user |
| `request_declined` | Provider declines | Fleet user |
| `counter_proposed` | Either party proposes new time | Other party |
| `counter_approved` | Fleet approves provider's time | Provider |
| `counter_rejected` | Fleet rejects provider's time | Provider |
| `request_completed` | Provider marks complete | Fleet user |
| `request_cancelled` | Fleet cancels | (not currently wired in UI) |
