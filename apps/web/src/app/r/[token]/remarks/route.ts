/**
 * Reader remarks on the internal product documents, at /r/<token>/remarks.
 *
 * This sits behind the same env + token gate as the documents themselves, and
 * that gate is the only thing in front of it: readers are not signed in and in
 * general do not have accounts. So the token is doing double duty here — it
 * keeps the documents out of sight, and it is the only reason this endpoint is
 * not simply an open write. Treat everything stored through it as public.
 *
 * Rows are written with the service-role client because `report_remarks` (118)
 * has RLS enabled and no policies: both `anon` and `authenticated` are denied
 * outright, so this route is the only door and its validation and rate limiting
 * cannot be walked around by talking to PostgREST with the anon key.
 *
 * A static segment beats the sibling `[doc]` dynamic segment in Next's route
 * matching, so /r/<token>/remarks reaches this file rather than rendering a
 * document named "remarks".
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkAccess, notFound } from '../gate';

export const dynamic = 'force-dynamic';

/**
 * An UNTYPED service-role client, the same as every API route under /api
 * builds for itself. `@/lib/supabase/server` returns one parameterised by the
 * hand-maintained `Database` type, which covers a subset of the schema — any
 * table missing from it collapses to `never` and every write against it fails
 * to compile. Adding `report_remarks` there would not help either: that type
 * omits the `Relationships` key supabase-js expects, so inserts resolve to
 * `never` for the tables it *does* list. Untyped is the working pattern here.
 */
function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Must match the documents registered in ../[doc]/route.ts. */
const DOCS = new Set(['release-1', 'plan']);
const KINDS = new Set(['suggestion', 'question', 'concern', 'agree']);

function docFrom(req: Request): string | null {
  const doc = new URL(req.url).searchParams.get('doc') ?? '';
  return DOCS.has(doc) ? doc : null;
}

/** Trim, collapse the empty string to null, and cap length at the column's. */
function optional(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  const doc = docFrom(req);
  if (!doc) return notFound();

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('report_remarks')
    .select('id, author, kind, topic, body, created_at')
    .eq('doc', doc)
    .eq('hidden', false)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: 'Could not load remarks.' }, { status: 500 });
  }

  return NextResponse.json(
    { remarks: data ?? [] },
    { headers: { 'cache-control': 'private, no-store' } }
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  const doc = docFrom(req);
  if (!doc) return notFound();

  // Per IP, since there is no account to key on. Generous enough that a reader
  // working through the document and leaving several remarks is never blocked.
  const limited = await enforceRateLimit(req, {
    bucket: 'report:remark',
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (body.length < 3) {
    return NextResponse.json({ error: 'Write a little more than that.' }, { status: 400 });
  }
  if (body.length > 4000) {
    return NextResponse.json({ error: 'That is longer than 4000 characters.' }, { status: 400 });
  }

  const kindRaw = typeof payload.kind === 'string' ? payload.kind : '';
  const kind = KINDS.has(kindRaw) ? kindRaw : 'suggestion';

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('report_remarks')
    .insert({
      doc,
      kind,
      body,
      author: optional(payload.author, 80),
      topic: optional(payload.topic, 120),
    })
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Could not post that.' }, { status: 500 });
  }

  return NextResponse.json({ remark: data }, { status: 201 });
}
