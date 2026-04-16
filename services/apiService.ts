/**
 * Internal API client — talks to the Express server at /api/v3 and /idp.
 * Handles OAuth2 client credentials token caching and transparent refresh.
 */
import { ServiceRequest } from '../types';
import { mapServiceRequestToApiPayload, GeoCoords } from './caseMapper';

// ── Token cache ────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let tokenCache: TokenCache | null = null;

async function fetchNewToken(): Promise<string> {
  const res = await fetch('/idp/v2/b2b/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: import.meta.env.VITE_API_CLIENT_ID,
      client_secret: import.meta.env.VITE_API_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  return json.access_token;
}

async function getValidToken(): Promise<string> {
  const now = Date.now();
  // Refresh 60 seconds before expiry
  if (tokenCache && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.token;
  }

  const token = await fetchNewToken();
  // Treat as 1 hour expiry (3600s)
  tokenCache = { token, expiresAt: now + 3_600_000 };
  return token;
}

// ── Generic fetch wrapper ──────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidToken();

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  // On 401 clear cache and retry once
  if (res.status === 401) {
    tokenCache = null;
    const freshToken = await getValidToken();
    const retry = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshToken}`,
        ...(options.headers ?? {}),
      },
    });
    if (!retry.ok) {
      const body = await retry.text();
      throw new Error(`API ${retry.status}: ${body}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Case submission ────────────────────────────────────────────────────────

interface SubmitCaseResult {
  id: string;
  status: string;
}

export async function submitCase(
  request: ServiceRequest,
  geo: GeoCoords
): Promise<SubmitCaseResult> {
  const payload = mapServiceRequestToApiPayload(request, geo);

  const data = await apiFetch<{ id: string; ersResponse?: { data?: { caseStatus?: string } } }>(
    '/api/v3/cases',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  return {
    id: data.id,
    status: data.ersResponse?.data?.caseStatus ?? 'NEW',
  };
}

// ── Case queries ───────────────────────────────────────────────────────────

interface ListCasesParams {
  shipTo: string;
  startDate: string; // ISO date string e.g. "2026-03-15"
  endDate: string;
  limit?: number;
  skip?: number;
}

interface CaseListItem {
  id: string;
  caseNumber: string;
  caseStatus: string;
  shipTo: string;
  created_at: string;
}

interface CaseListResponse {
  cases: CaseListItem[];
  total: number;
}

export async function getCases(params: ListCasesParams): Promise<CaseListItem[]> {
  const qs = new URLSearchParams({
    customerShipTo: params.shipTo,
    startDate: params.startDate,
    endDate: params.endDate,
    ...(params.limit !== undefined && { limit: String(params.limit) }),
    ...(params.skip !== undefined && { skip: String(params.skip) }),
  });

  const data = await apiFetch<CaseListResponse>(`/api/v3/cases?${qs}`);
  return data.cases;
}

export async function getCaseById(id: string): Promise<unknown | null> {
  try {
    return await apiFetch<unknown>(`/api/v3/cases/${id}`);
  } catch {
    return null;
  }
}
