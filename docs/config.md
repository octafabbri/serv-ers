# Configuration

## Environment Variables

Copy `.env.example` to `.env.local` (Vite loads `.env.local` automatically).

| Variable | Required | Description |
|---|---|---|
| `VITE_OPENAI_API_KEY` | Yes | OpenAI API key — used for GPT-4o chat and TTS |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://abc123.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |

All variables must be prefixed with `VITE_` to be exposed in the browser by Vite. They are accessed via `import.meta.env.VITE_*`.

> **Security note**: The OpenAI API key is bundled into the client-side JavaScript and visible in the browser. See [decisions.md](decisions.md) for the rationale.

## Build Configuration

### Vite ([vite.config.ts](../vite.config.ts))
- Dev server: `0.0.0.0:3000`
- Path alias: `@` → project root
- React plugin: `@vitejs/plugin-react`

### TypeScript ([tsconfig.json](../tsconfig.json))
- Standard React/Vite config (exact settings not confirmed — read the file for current target/lib settings)

### Tailwind CSS ([tailwind.config.js](../tailwind.config.js))
- Tailwind v4 (PostCSS plugin: `@tailwindcss/postcss`)
- Config: [postcss.config.js](../postcss.config.js)
- Global styles: [src/index.css](../src/index.css), [src/styles/theme.css](../src/styles/theme.css)

### Node Version

`.node-version` specifies a minimum of Node 20. The `package.json` `engines` field enforces `>=20.0.0`.

## Test Configuration

### Vitest ([vitest.config.ts](../vitest.config.ts))
- Environment: `jsdom`
- Setup file: [src/test/setup.ts](../src/test/setup.ts) (imports `@testing-library/jest-dom`)
- Run with `npm test` (watch) or `npm run test:run` (CI)

Test files:
- [components/SettingsPage.test.tsx](../components/SettingsPage.test.tsx)
- [services/serviceRequestService.test.ts](../services/serviceRequestService.test.ts)
- [services/userProfileService.test.ts](../services/userProfileService.test.ts)

## Deployment

### Cloudflare Pages (via Wrangler)

[wrangler.jsonc](../wrangler.jsonc):
```json
{
  "name": "hey",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2025-04-01"
}
```

Deploy commands:
```bash
npm run deploy          # production
npm run deploy:preview  # preview branch
```

Both commands run `vite build` first, then `wrangler pages deploy`.

### Cloudflare Pages Routing

[public/_redirects](../public/_redirects) and [public/_routes.json](../public/_routes.json) configure SPA routing so all paths serve `index.html`.

### PWA

[public/manifest.json](../public/manifest.json) — web app manifest for installability.
[public/service-worker.js](../public/service-worker.js) — caching service worker.

## Database Setup

Run [supabase-schema.sql](../supabase-schema.sql) once in the Supabase SQL editor to create:
- Tables: `users`, `service_requests`, `counter_proposals`, `service_request_notifications`
- Indexes, triggers, RLS policies, and all RPCs

Incremental migrations are in [supabase/migrations/](../supabase/migrations/). The combined schema file supersedes the individual migration files — use it for a fresh setup.

## localStorage Keys

| Key | Managed by | Content |
|---|---|---|
| `heyBibUserProfile` | `userProfileService` | Serialised `UserProfile` JSON |
| `heyUserRole` | `userProfileService` | `"fleet"` or `"provider"` |
| `heyDeviceId` | `userProfileService` | UUID (device identity) |
| `provider_voice_settings` | `ProviderApp` | `{ voiceURI, language }` |

## sessionStorage Keys (Provider only)

| Key | Content |
|---|---|
| `provider_seen_requests` | JSON array of request IDs shown to the FSM |
| `provider_announced_ids` | JSON array of IDs for which TTS was played |
