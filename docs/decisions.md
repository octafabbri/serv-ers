# Architectural Decisions

## 1. Client-Side OpenAI API Key

**Decision**: The OpenAI API key (`VITE_OPENAI_API_KEY`) is injected into the client bundle and called directly from the browser (`dangerouslyAllowBrowser: true`).

**Why**: This is a demo / internal tool, not a public-facing product. No backend server was needed, keeping deployment and infrastructure cost near zero.

**Trade-off**: The API key is visible in the browser's network tab and the bundled JS. Anyone with access to the deployed URL can extract the key. For production, calls should be proxied through a serverless function (Cloudflare Workers, Supabase Edge Functions, etc.) that holds the key server-side.

---

## 2. Anonymous Supabase Authentication

**Decision**: Users sign in via `supabase.auth.signInAnonymously()` — no email/password, no OAuth.

**Why**: The target users are truck drivers who need zero-friction onboarding. Asking them to register an account would be a barrier.

**Trade-off**: Each new browser/device gets a new identity. If a driver changes phones, their history is not transferred. A future version could link anonymous accounts to a phone number or email.

---

## 3. Device ID for User Identity

**Decision**: A `heyDeviceId` UUID is generated and stored in `localStorage` on first launch. This is used as the `device_id` column (upsert key) in the `users` table, independent of the Supabase `auth.uid()`.

**Why**: Provides a stable user identity that survives page refreshes and session expiry, without requiring re-registration.

**Trade-off**: Clearing `localStorage` orphans the user row. Two browser tabs on the same machine may compete for the same device ID.

---

## 4. All State Transitions via Postgres RPCs

**Decision**: Accept, decline, propose, approve, reject, and complete are all `SECURITY DEFINER` Postgres functions, not direct table updates.

**Why**: State transitions require coordinated writes (update status + insert notification + enforce role checks atomically). Doing this in client code with direct table mutations would allow race conditions and RLS bypasses.

**Trade-off**: More SQL to maintain. But it makes authorization logic easy to audit in one place.

---

## 5. JSONB for Flexible Service Fields

**Decision**: `location`, `tire_info`, `mechanical_info`, and `proposal_history` are stored as JSONB columns.

**Why**: Tire and mechanical services have different required fields. Using JSONB avoids nullable column sprawl and allows the schema to evolve without migrations for new sub-fields.

**Trade-off**: No column-level type enforcement from Postgres. Application-level validation (`validateServiceRequest`) and TypeScript interfaces are the only guardrails.

---

## 6. Voice TTS via OpenAI (not Web Speech API)

**Decision**: Text-to-speech uses OpenAI's `tts-1` model and the `AudioContext` API for playback, not the browser's `SpeechSynthesis` API.

**Why**: Browser TTS voice quality varies widely across platforms, is inconsistent on mobile, and cannot be customised. OpenAI TTS produces consistent, high-quality audio across all environments.

**Trade-off**: Each response incurs an API call and adds latency (~300–800ms). The speech queue (`speechQueueRef`) prevents overlapping audio but can delay playback if multiple messages are queued rapidly.

---

## 7. Speech Queue for Serial TTS Playback

**Decision**: `speakAiResponse` chains calls onto a `speechQueueRef: Promise<void>` so audio plays serially.

**Why**: The `AudioBufferSourceNode.onended` event fires slightly before the audio pipeline finishes rendering, so starting a new response immediately after `onended` can produce overlapping audio.

**Trade-off**: If many messages queue up rapidly (e.g., during a fast service-request confirmation flow), the user hears them all in sequence even if the earlier ones are stale. No mechanism to discard stale queued messages currently exists.

---

## 8. `FleetApp` as a Monolithic Component

**Decision**: `FleetApp.tsx` is a single large component (~600 lines) holding all fleet state, refs, and logic.

**Why**: The voice UI has many interdependencies between state values (e.g., `isListening`, `isSpeaking`, `isServiceRequestActive`) that are hard to split cleanly without prop-drilling or a context/state management library.

**Trade-off**: The file is large and dense. Adding features requires careful attention to stale closure issues in async callbacks. A future refactor could extract the service-request workflow into a custom hook.

---

## 9. Figma Export as Reference Only

**Decision**: `figma-export/` contains a separate Vite app with the original Figma-exported components. These are **not imported** by the production app.

**Why**: Figma exports often produce component structures that don't integrate cleanly into an existing app. The production voice-ui components were custom implementations inspired by the designs.

**Trade-off**: Design and implementation are not tightly coupled. UI changes in Figma must be manually translated. The figma-export directory adds noise to the repo.

---

## 10. Multi-Round Proposal Negotiation

**Decision**: The `propose_new_time` RPC supports multi-round back-and-forth: provider proposes → fleet counter-proposes → provider re-proposes, etc. Each round appends to `proposal_history`.

**Why**: In practice, scheduling a truck service often takes more than one exchange. A single counter-proposal limit would force users out of the app to negotiate by phone.

**Trade-off**: There is no upper bound on negotiation rounds. The history array grows unboundedly. The UI shows the full history in `RequestDetailModal` and in the coordination agent's system prompt.
