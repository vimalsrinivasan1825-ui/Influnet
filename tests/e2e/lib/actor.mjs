// An "Actor" is one logged-in persona that can call the app's HTTP API exactly
// the way the real client does: `Authorization: Bearer <supabase access token>`
// (which is what lib/api.ts withAuth() reads).
//
// Why API-level rather than Playwright for the bulk of the audit: the bugs this
// audit is hunting are concurrency and authorization bugs — two businesses
// hitting one creator in the same millisecond, both sides of a project
// advancing the same stage at once, a non-participant reaching a project id.
// A browser can't express "these six requests leave at the same instant", and
// running six browsers to find out costs minutes per scenario. Actors can, and
// it costs milliseconds. The UI is verified separately, where UI is the risk.

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
}

export class Actor {
  constructor(persona) {
    this.persona = persona;
    this.key = persona.key;
    this.name = persona.name || persona.companyName;
    this.role = persona.role;
    this.userId = null;
    this.token = null;
    this.client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Every HTTP call this actor makes, for the report.
    this.log = [];
  }

  /** Sign up a brand-new auth user, carrying the profile answers as user_metadata. */
  async signUp() {
    const { role, email, password, ...rest } = this.persona;
    const metadata = { role, ...rest };
    delete metadata.key;
    delete metadata.approve;
    delete metadata.tier;

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw new Error(`signUp(${this.key}): ${error.message}`);
    this.userId = data.user?.id ?? null;
    // With email confirmation OFF, signUp returns a session immediately. If it
    // is ever turned ON this is null and signIn() below has to do the work —
    // which is itself a finding worth surfacing, not something to paper over.
    this.token = data.session?.access_token ?? null;
    this.emailConfirmedAtSignup = Boolean(data.session);
    return data;
  }

  async signIn() {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: this.persona.email,
      password: this.persona.password,
    });
    if (error) throw new Error(`signIn(${this.key}): ${error.message}`);
    this.userId = data.user.id;
    this.token = data.session.access_token;
    return data;
  }

  /** Complete registration through the real endpoint (writes profiles + role table). */
  async register() {
    const { role, email, password, key, approve, tier, ...rest } = this.persona;
    return this.api('POST', '/api/auth/register', { role, ...rest });
  }

  /**
   * Call the app API as this actor. Never throws on a non-2xx — the status IS
   * the assertion in most of this audit ("this must be 403"), so the caller
   * always gets { status, body } back and decides what it means.
   */
  async api(method, path, body, { headers = {}, raw = false } = {}) {
    const url = path.startsWith('http') ? path : BASE_URL + path;
    const started = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    const entry = {
      actor: this.key, method, path, status: res.status,
      ms: Date.now() - started,
      body: raw ? undefined : parsed,
    };
    this.log.push(entry);
    return { status: res.status, ok: res.ok, body: parsed, headers: res.headers };
  }

  get(path, opts) { return this.api('GET', path, undefined, opts); }
  post(path, body, opts) { return this.api('POST', path, body, opts); }
  patch(path, body, opts) { return this.api('PATCH', path, body, opts); }
  put(path, body, opts) { return this.api('PUT', path, body, opts); }
  del(path, body, opts) { return this.api('DELETE', path, body, opts); }
}

/**
 * Fire N async thunks as close to simultaneously as the runtime allows and
 * return every outcome (never rejects). This is the core primitive for the
 * race scenarios: `Promise.allSettled` over already-started promises means the
 * requests are genuinely in flight together rather than serialised.
 */
export async function raceAll(thunks) {
  const started = thunks.map((t) => Promise.resolve().then(t));
  const settled = await Promise.allSettled(started);
  return settled.map((s) =>
    s.status === 'fulfilled' ? s.value : { status: 0, ok: false, body: { error: String(s.reason) } }
  );
}

export { BASE_URL };
