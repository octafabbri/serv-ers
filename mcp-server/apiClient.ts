/**
 * HTTP client for the Fleet Cases API (/api/v3/cases).
 * Uses OAuth2 client credentials with token caching — same pattern as services/apiService.ts
 * but runs in Node.js context (process.env instead of import.meta.env).
 */

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const CLIENT_ID = process.env.API_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.API_CLIENT_SECRET ?? '';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function fetchNewToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/idp/v2/b2b/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}

async function getValidToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.token;
  }
  const token = await fetchNewToken();
  tokenCache = { token, expiresAt: now + 3_600_000 };
  return token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidToken();

  const doRequest = async (t: string) =>
    fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
        ...(options.headers ?? {}),
      },
    });

  let res = await doRequest(token);

  if (res.status === 401) {
    tokenCache = null;
    const fresh = await getValidToken();
    res = await doRequest(fresh);
  }

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}
