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
  /**
   * The parsed body, present whether or not the request succeeded — `data` is
   * deliberately nulled on a non-2xx so no caller mistakes an error page for a
   * result, and that is the right default for almost everything here.
   *
   * It is wrong for the handful of routes whose 4xx *is* the answer:
   * /api/auth/social-preview replies 404 with `{status:'notfound'}`, which is a
   * verdict on the handle, not a failure. Those callers read `payload`; nulling
   * it turned "no such account" into "couldn't reach Instagram".
   *
   * Optional because screens compose ApiResult-shaped literals of their own
   * (merged fetches, cached replies) and none of them owe us a raw body;
   * requests that go through this client always carry it.
   */
  payload?: unknown;
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

/**
 * Hard ceiling on any single request. React Native's `fetch` has no default
 * timeout, so a connection that stalls — the everyday case when the app resumes
 * from the background onto a half-alive network — hangs forever, and with it
 * anything awaiting the call (the entry gate's profile load and its recovery
 * `register({})`, which is otherwise unbounded). 15s is well past a slow-but-real
 * response and short enough that a dead network surfaces as an error, not a freeze.
 */
const REQUEST_TIMEOUT_MS = 15_000;

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        signal: options.signal ?? controller.signal,
      });
    } catch {
      // Offline, DNS failure, server unreachable, or our own timeout aborted it.
      // On mobile this is common enough that it needs to be a normal result, not
      // a thrown exception every caller has to wrap.
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'No connection. Check your network.',
        payload: null,
      };
    } finally {
      clearTimeout(timer);
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
      payload: data,
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
