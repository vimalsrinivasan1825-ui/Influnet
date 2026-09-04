/**
 * Two-phone test-run sessions, at /r/<token>/test-sessions.
 *
 * Sits behind the same env + token gate as the documents (see ../gate.ts),
 * but goes further than remarks/route.ts: a session is private to the device
 * that created it, not shared with every reader of the link. See migration
 * 146 for how the secret makes that true without an account system.
 *
 * A static segment beats the sibling `[doc]` dynamic segment in Next's route
 * matching, so /r/<token>/test-sessions reaches this file rather than
 * rendering a document named "test-sessions" — same trick as ../remarks.
 */
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkAccess } from '../gate';

export const dynamic = 'force-dynamic';

/** Untyped service-role client — see remarks/route.ts for why. */
function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function hash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Trim, collapse the empty string to null, and cap length at the column's. */
function optional(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A session is at most 5000 keys of {s, n} pairs — one per checklist step,
 * which today numbers a few hundred. Bounded rather than trusted verbatim:
 * this is an unauthenticated route, and jsonb has no size limit of its own.
 */
function sanitizeResults(value: unknown): Record<string, { s: string; n: string }> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 2000) return null;
  const out: Record<string, { s: string; n: string }> = {};
  for (const [key, raw] of entries) {
    if (typeof key !== 'string' || key.length > 40) return null;
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const s = typeof r.s === 'string' ? r.s.slice(0, 20) : '';
    const n = typeof r.n === 'string' ? r.n.slice(0, 4000) : '';
    out[key] = { s, n };
  }
  return out;
}

/**
 * Deliberately indistinguishable from "this session does not exist" — a
 * session's presence is not confirmed to a caller without its secret, the
 * same reasoning as the token gate itself.
 */
function sessionNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Counts for the shared-runs list, computed here so the listing does not have
 * to ship every note of every run to render one line each.
 */
function summarise(results: unknown): { pass: number; issue: number; block: number; na: number; recorded: number } {
  const out = { pass: 0, issue: 0, block: 0, na: 0, recorded: 0 };
  if (typeof results !== 'object' || results === null) return out;
  for (const value of Object.values(results as Record<string, unknown>)) {
    const s = (value as { s?: unknown } | null)?.s;
    if (typeof s !== 'string' || !s) continue;
    out.recorded += 1;
    if (s === 'pass' || s === 'issue' || s === 'block' || s === 'na') out[s] += 1;
  }
  return out;
}

/**
 * GET /r/<token>/test-sessions — three reads, told apart by query string:
 *
 *   ?session=<id>&secret=<secret>  the owning device reads its own run (r/w)
 *   ?share=<share_id>              anyone with the document token reads a
 *                                  SHARED run (read-only, migration 147)
 *   ?shared=1                      list the runs that have been shared
 *
 * The share paths deliberately never look at `secret` and never return it, so
 * no amount of replaying a shared link yields write access.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get('session') ?? '';
  const secret = url.searchParams.get('secret') ?? '';
  const share = url.searchParams.get('share') ?? '';
  const wantsList = url.searchParams.get('shared') === '1';

  const limited = await enforceRateLimit(req, {
    bucket: 'report:test-session:read',
    limit: 120,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const supabase = serviceClient();

  // The index of shared runs — what makes "see what someone else already
  // tested" possible. Only ever rows that opted in; an unshared run is not
  // named, counted or hinted at here.
  if (wantsList) {
    const { data, error } = await supabase
      .from('report_test_sessions')
      .select('share_id, tester, build, results, started_at, updated_at, shared_at')
      .not('share_id', 'is', null)
      .order('shared_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ runs: [] }, { status: 200 });

    return NextResponse.json(
      {
        runs: (data ?? []).map((row: Record<string, any>) => ({
          shareId: row.share_id,
          tester: row.tester,
          build: row.build,
          startedAt: row.started_at,
          updatedAt: row.updated_at,
          counts: summarise(row.results),
        })),
      },
      { headers: { 'cache-control': 'private, no-store' } }
    );
  }

  // A shared run, read-only. `readOnly` is advisory for the UI; the actual
  // guarantee is that PATCH accepts nothing but the secret.
  if (share) {
    const { data, error } = await supabase
      .from('report_test_sessions')
      .select('tester, build, results, started_at, updated_at, share_id')
      .eq('share_id', share)
      .maybeSingle();

    if (error || !data) return sessionNotFound();

    return NextResponse.json(
      {
        session: {
          id: null,
          tester: data.tester,
          build: data.build,
          results: data.results ?? {},
          startedAt: data.started_at,
          updatedAt: data.updated_at,
        },
        readOnly: true,
      },
      { headers: { 'cache-control': 'private, no-store' } }
    );
  }

  if (!id || !secret) return sessionNotFound();

  const { data, error } = await supabase
    .from('report_test_sessions')
    .select('id, tester, build, results, started_at, updated_at, secret_hash, share_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !data || data.secret_hash !== hash(secret)) return sessionNotFound();

  return NextResponse.json(
    {
      session: {
        id: data.id,
        tester: data.tester,
        build: data.build,
        results: data.results ?? {},
        startedAt: data.started_at,
        updatedAt: data.updated_at,
        shareId: data.share_id ?? null,
      },
    },
    { headers: { 'cache-control': 'private, no-store' } }
  );
}

/** POST /r/<token>/test-sessions — create a session. Returns the secret ONCE. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  // Generous — this fires once per device per run, not once per save.
  const limited = await enforceRateLimit(req, {
    bucket: 'report:test-session:create',
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tester = optional(payload.tester, 120);
  const build = optional(payload.build, 120);

  const secret = randomUUID() + randomUUID();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('report_test_sessions')
    .insert({ secret_hash: hash(secret), tester, build })
    .select('id, started_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Could not start a session.' }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, secret, startedAt: data.started_at },
    { status: 201 }
  );
}

/** PATCH /r/<token>/test-sessions?session=<id>&secret=<secret> — update a session. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get('session') ?? '';
  const secret = url.searchParams.get('secret') ?? '';
  if (!id || !secret) return sessionNotFound();

  const limited = await enforceRateLimit(req, {
    bucket: 'report:test-session:write',
    limit: 240,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const supabase = serviceClient();
  const { data: existing, error: readError } = await supabase
    .from('report_test_sessions')
    .select('id, secret_hash, share_id')
    .eq('id', id)
    .maybeSingle();

  if (readError || !existing || existing.secret_hash !== hash(secret)) return sessionNotFound();

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (payload.tester !== undefined) update.tester = optional(payload.tester, 120);
  if (payload.build !== undefined) update.build = optional(payload.build, 120);
  if (payload.results !== undefined) {
    const results = sanitizeResults(payload.results);
    if (results === null) {
      return NextResponse.json({ error: 'That save was malformed.' }, { status: 400 });
    }
    update.results = results;
  }

  // Sharing is only ever toggled by the secret holder — the same check that
  // guards a write, because publishing someone's run IS a write to it.
  //
  // Turning sharing on twice keeps the existing id rather than minting a new
  // one, so a link already sent to the team does not quietly stop working
  // because someone pressed the button again. Turning it off clears both
  // columns, which retires that id permanently: the partial unique index would
  // let it be reissued, but nothing here ever reuses one.
  if (payload.share !== undefined) {
    if (payload.share === true) {
      update.share_id = existing.share_id ?? randomUUID().replace(/-/g, '');
      update.shared_at = new Date().toISOString();
    } else if (payload.share === false) {
      update.share_id = null;
      update.shared_at = null;
    } else {
      return NextResponse.json({ error: 'share must be true or false.' }, { status: 400 });
    }
  }

  const { error: writeError } = await supabase
    .from('report_test_sessions')
    .update(update)
    .eq('id', id);

  if (writeError) {
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updatedAt: update.updated_at,
    // Only reported when this request actually touched sharing — a plain save
    // should not have to think about it.
    ...(payload.share !== undefined ? { shareId: (update.share_id as string | null) ?? null } : {}),
  });
}
