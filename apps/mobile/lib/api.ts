/**
 * The app's single API client, pointed at the deployed web app's /api/* routes.
 *
 * Mobile deliberately does NOT query Postgres directly. Every rule that makes
 * the product safe — RLS, the PII column lockdown, rate limits, admin gating,
 * audit logging — lives in those route handlers, and a second client reaching
 * past them would be a second place to get it wrong.
 */
import { createApiClient, createEndpoints } from '@influnet/api';
import { API_BASE_URL, supabase } from './supabase';

type UnauthorizedHandler = (token: string) => void;

let onUnauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registered by the root layout so a 401 anywhere bounces to sign-in.
 *
 * The handler is given the access token the rejected request carried, so it can
 * confirm the 401 belongs to the session that is live *now* before signing
 * anyone out. See the note in app/_layout.tsx.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorizedHandler = fn;
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  onUnauthorized: (token) => onUnauthorizedHandler?.(token),
});

export const endpoints = createEndpoints(api);
