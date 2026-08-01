'use client';

import { createClient } from '@/lib/supabase/client';
import { captureBrowserError } from '@/lib/observability-client';

// Single source of truth for the API bearer token: the live Supabase session.
// Never read tokens from localStorage — cached copies go stale after refresh
// and are exposed to any XSS.
export async function getAuthToken(): Promise<string | null> {
  const sb = createClient();
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
}

// fetch() wrapper for /api/* calls: injects the bearer token and parses JSON
// safely (never throws "Unexpected end of JSON input" on empty error bodies).
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** Correlation id from middleware. Present on every response; the thing to
   *  quote when reporting a failure — it maps to a log line and a Sentry event. */
  requestId: string | null;
}> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...options, headers });
  const requestId = res.headers.get('x-request-id');

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body — leave data null
  }

  // A 5xx is a server fault the user cannot act on and nobody would otherwise
  // hear about — the server logs it, but only if the request reached a handler.
  // Reporting from the browser covers the gap and carries the request id, so
  // the Sentry event and the server log line can be lined up.
  if (!res.ok && res.status >= 500) {
    captureBrowserError(
      new Error(`API ${res.status} on ${path}: ${data?.error ?? 'no body'}`),
      { kind: 'api-5xx', status: res.status, path, requestId },
    );
  }

  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? (data as T) : null,
    error: res.ok ? null : data?.error || `Request failed (${res.status})`,
    requestId,
  };
}
