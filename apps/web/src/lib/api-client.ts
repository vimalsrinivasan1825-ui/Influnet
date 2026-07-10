'use client';

import { createClient } from '@/lib/supabase/client';

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
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...options, headers });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body — leave data null
  }

  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? (data as T) : null,
    error: res.ok ? null : data?.error || `Request failed (${res.status})`,
  };
}
