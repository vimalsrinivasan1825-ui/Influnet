import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Service-role client, or null when the key is not configured. Server-only. */
export function serviceRoleClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * For RPCs that only the service role may execute. Falls back to the caller's
 * client when no key is configured, so the call fails closed (permission
 * denied) instead of silently running with the wrong identity.
 */
export function privileged<T>(fallback: T): SupabaseClient | T {
  return serviceRoleClient() ?? fallback;
}
