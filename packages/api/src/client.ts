/**
 * @influnet/api — the platform-agnostic half of the old
 * apps/web/src/lib/api-client.ts.
 *
 * Both clients hit the same Next.js route handlers under /api/* and both
 * authenticate the same way: `Authorization: Bearer <supabase access token>`
 * (see the token read in apps/web/src/lib/api.ts). The only things that differ
 * per platform are *where* the API lives and *how* you get a token:
 *
 *   web    — baseUrl '' (same origin), token from the browser Supabase client
 *   mobile — baseUrl https://<deployment>, token from the SecureStore-backed client
 *
 * So those two become constructor arguments and everything else is shared.
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export interface ApiClientOptions {
  /** Origin the API is served from. Empty string means same-origin (web). */
  baseUrl?: string;
  /**
   * Returns the current access token, or null when signed out. Called per
   * request — never cache the result. A stale token outlives its session and
   * a cached copy is one XSS away from being stolen.
   */
  getToken: () => Promise<string | null>;
  /**
   * Called when a request that *did* carry a token came back 401 — i.e. the
   * session expired or was revoked server-side.
   *
   * Deliberately NOT called when getToken() returned null. A tokenless request
   * 401s because we are signed out, which is a state the app already knows
   * about; treating it as an auth failure is how sign-out turned into a loop
   * (stray request -> 401 -> sign out + navigate -> re-render -> more requests).
   *
   * Receives the token the rejected request actually carried, so the handler
   * can tell "the session I am in right now died" from "a request belonging to
   * a session that already ended finally came back". The latter must be ignored:
   * a slow request issued before sign-out can land after the *next* account has
   * signed in, and acting on it signs that innocent new session out.
   *
   * The parameter is optional to callers — an existing `() => void` handler
   * still type-checks and still behaves exactly as before.
   */
  onUnauthorized?: (token: string) => void;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient({ baseUrl = '', getToken, onUnauthorized }: ApiClientOptions) {
  async function request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    const rawToken = await getToken();
    const token = rawToken?.replace(/[\r\n\s]+/g, '') ?? null;

    const headers: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers as Record<string, string>)) {
        if (typeof v === 'string') headers[k] = v.replace(/[\r\n]+/g, '');
      }
    }

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    } catch {
      // Offline, DNS failure, server unreachable. On mobile this is common
      // enough that it needs to be a normal result, not a thrown exception
      // every caller has to wrap.
      return { ok: false, status: 0, data: null, error: 'No connection. Check your network.' };
    }

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // empty or non-JSON body — leave data null
    }

    // Only a token we actually sent can have been rejected. A 401 on a request
    // with no Authorization header just means "signed out" — see the note on
    // onUnauthorized above.
    // The token is passed on so the handler can check it is still the current
    // one before tearing anything down.
    if (res.status === 401 && token) onUnauthorized?.(token);

    const errorMessage =
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;

    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (data as T) : null,
      error: res.ok ? null : errorMessage,
    };
  }

  const json = (body: unknown) => ({ body: JSON.stringify(body) });

  return {
    request,
    get: <T = unknown>(path: string) => request<T>(path),
    post: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', ...(body === undefined ? {} : json(body)) }),
    patch: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', ...(body === undefined ? {} : json(body)) }),
    put: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PUT', ...(body === undefined ? {} : json(body)) }),
    del: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}
