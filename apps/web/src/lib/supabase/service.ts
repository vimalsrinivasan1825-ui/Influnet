import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for server code that writes on behalf of the platform
 * (webhooks, cron routes, reporting ledgers). Bypasses RLS and column grants —
 * only use it after the caller has been authorised, or where no caller exists.
 *
 * Returns null when the key is not configured, so callers can degrade instead
 * of throwing at import time.
 */
export function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
