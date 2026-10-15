#!/usr/bin/env node
/**
 * Nightly autofix — step 1: collect.
 *
 * Gathers what went wrong in the last AUTOFIX_WINDOW_HOURS (default 24) and
 * writes it to autofix-inbox.json for the triage step:
 *
 *   - Sentry: unresolved issues seen in the window, with the latest event's
 *     exception and in-app frames.
 *   - product_feedback rows of kind bug/confusion still marked 'new'.
 *   - support_tickets of category 'bug' still open or pending.
 *
 * This is the ONLY step that holds the Sentry token and the Supabase key. The
 * triage step (Claude) sees the redacted file and nothing else, so a user who
 * types instructions into a feedback box can't reach a credential.
 *
 * Every source is optional: a missing secret skips that source with a note, so
 * the workflow still runs while the owner is wiring things up.
 *
 * Env:
 *   AUTOFIX_SENTRY_TOKEN, AUTOFIX_SENTRY_ORG, AUTOFIX_SENTRY_PROJECT
 *   AUTOFIX_SENTRY_URL          default https://sentry.io (use https://de.sentry.io for EU)
 *   AUTOFIX_SENTRY_ENVIRONMENT  default staging — staging.influnet.io is the live site
 *   AUTOFIX_SUPABASE_URL, AUTOFIX_SUPABASE_KEY
 *   AUTOFIX_WINDOW_HOURS        default 24
 *   GH_TOKEN, GITHUB_REPOSITORY for skipping items that already have a PR/issue
 *
 * Usage: node scripts/autofix/collect.mjs [out-file]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'autofix-inbox.json';
const windowHours = Number(process.env.AUTOFIX_WINDOW_HOURS || 24);
const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
const notes = [];

// ── Redaction ────────────────────────────────────────────────────────────────
// Free text from users and error messages can carry emails, phone numbers and
// tokens (reset links, invite codes). None of it helps fix a bug.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Indian mobiles, or anything written with a +country code. A bare digit run
// would also eat dates and ids, which triage needs.
const PHONE = /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d/g;
// JWTs, and long strings mixing letters and digits. Long all-letter
// identifiers (function names) are left alone.
const TOKEN = /\b(?:eyJ[\w-]+\.[\w-]+\.[\w-]+|(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[A-Za-z0-9_-]{32,})\b/g;

function redact(value, max = 1500) {
  if (value == null) return value;
  const s = String(value)
    .replace(EMAIL, '[email]')
    .replace(TOKEN, '[token]')
    .replace(PHONE, '[phone]');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ── Sentry ──────────────────────────────────────────────────────────────────
async function sentry(path) {
  const base = process.env.AUTOFIX_SENTRY_URL || 'https://sentry.io';
  const res = await fetch(`${base}/api/0${path}`, {
    headers: { Authorization: `Bearer ${process.env.AUTOFIX_SENTRY_TOKEN}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Sentry ${path.split('?')[0]} → ${res.status}`);
  return res.json();
}

function framesOf(event) {
  const exc = (event.entries || []).find((e) => e.type === 'exception');
  const values = exc?.data?.values || [];
  return values.map((v) => {
    const all = v.stacktrace?.frames || [];
    // The SDK-less reporter in lib/observability.ts doesn't set inApp, so fall
    // back to "not in node_modules / node: internals".
    const inApp = all.filter((f) =>
      f.inApp ?? !/node_modules|^node:|internal\//.test(f.filename || f.absPath || ''),
    );
    return {
      type: v.type,
      value: redact(v.value, 500),
      frames: (inApp.length ? inApp : all)
        .slice(-15)
        .map((f) => ({ file: f.filename || f.absPath, function: f.function, line: f.lineNo })),
    };
  });
}

async function collectSentry() {
  const { AUTOFIX_SENTRY_TOKEN, AUTOFIX_SENTRY_ORG: org, AUTOFIX_SENTRY_PROJECT: slug } = process.env;
  if (!AUTOFIX_SENTRY_TOKEN || !org || !slug) {
    notes.push('Sentry skipped: AUTOFIX_SENTRY_TOKEN / _ORG / _PROJECT not all set.');
    return [];
  }
  const env = process.env.AUTOFIX_SENTRY_ENVIRONMENT || 'staging';
  const project = await sentry(`/projects/${org}/${slug}/`);
  const qs = new URLSearchParams({
    project: project.id,
    environment: env,
    query: `is:unresolved lastSeen:-${windowHours}h`,
    sort: 'freq',
    limit: '25',
  });
  const issues = await sentry(`/organizations/${org}/issues/?${qs}`);

  const items = [];
  for (const issue of issues) {
    let latest = null;
    try {
      latest = await sentry(`/organizations/${org}/issues/${issue.id}/events/latest/`);
    } catch (err) {
      notes.push(`Sentry ${issue.shortId}: latest event unreadable (${err.message}).`);
    }
    const tags = Object.fromEntries((latest?.tags || []).map((t) => [t.key, t.value]));
    items.push({
      key: `sentry-${issue.id}`,
      source: 'sentry',
      id: issue.shortId,
      url: issue.permalink,
      title: redact(issue.title, 300),
      culprit: redact(issue.culprit, 300),
      level: issue.level,
      category: issue.issueCategory,
      events: Number(issue.count),
      users: issue.userCount,
      first_seen: issue.firstSeen,
      last_seen: issue.lastSeen,
      release: tags.release || latest?.release?.version || null,
      // Only routing tags. Never user, request body, headers or cookies.
      tags: Object.fromEntries(
        ['path', 'method', 'route_type', 'route', 'status'].filter((k) => tags[k]).map((k) => [k, tags[k]]),
      ),
      exception: latest ? framesOf(latest) : [],
    });
  }
  return items;
}

// ── Influnet's own feedback and tickets (migration 098) ──────────────────────
async function rest(path) {
  const url = process.env.AUTOFIX_SUPABASE_URL.replace(/\/$/, '');
  const key = process.env.AUTOFIX_SUPABASE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} → ${res.status}`);
  return res.json();
}

async function collectUserReports() {
  if (!process.env.AUTOFIX_SUPABASE_URL || !process.env.AUTOFIX_SUPABASE_KEY) {
    notes.push('Feedback and tickets skipped: AUTOFIX_SUPABASE_URL / _KEY not set.');
    return [];
  }
  const items = [];
  const s = encodeURIComponent(since);

  // user_id is deliberately not selected: triage needs the complaint, not the person.
  const feedback = await rest(
    `product_feedback?select=id,kind,message,rating,surface,created_at` +
      `&status=eq.new&kind=in.(bug,confusion)&created_at=gte.${s}&order=created_at.desc&limit=25`,
  );
  for (const f of feedback) {
    items.push({
      key: `feedback-${f.id}`,
      source: 'feedback',
      id: f.id,
      kind: f.kind,
      surface: f.surface,
      rating: f.rating,
      created_at: f.created_at,
      text: redact(f.message),
    });
  }

  const tickets = await rest(
    `support_tickets?select=id,subject,priority,status,context,created_at` +
      `&category=eq.bug&status=in.(open,pending)&created_at=gte.${s}&order=created_at.desc&limit=25`,
  );
  for (const t of tickets) {
    // The user's first message is the bug description; admin replies and
    // internal notes are left out.
    let first = [];
    try {
      first = await rest(
        `ticket_messages?select=body&ticket_id=eq.${t.id}&from_admin=eq.false&internal=eq.false` +
          `&order=created_at.asc&limit=1`,
      );
    } catch (err) {
      notes.push(`Ticket ${t.id}: messages unreadable (${err.message}).`);
    }
    items.push({
      key: `ticket-${t.id}`,
      source: 'ticket',
      id: t.id,
      priority: t.priority,
      created_at: t.created_at,
      // context is an allowlist of page / app version / platform (see /api/support/tickets).
      context: Object.fromEntries(
        Object.entries(t.context || {}).map(([k, v]) => [k, redact(typeof v === 'string' ? v : JSON.stringify(v), 200)]),
      ),
      text: redact(`${t.subject}\n\n${first[0]?.body || ''}`.trim()),
    });
  }
  return items;
}

// ── Already handled? ─────────────────────────────────────────────────────────
// Bodies of open autofix PRs and needs-human issues carry `autofix-key: <key>`.
function handledKeys() {
  if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY) return new Set();
  const keys = new Set();
  const lists = [
    ['pr', 'list', '--label', 'autofix'],
    ['issue', 'list', '--label', 'needs-human'],
  ];
  for (const args of lists) {
    try {
      const json = execFileSync('gh', [...args, '--state', 'open', '--limit', '200', '--json', 'body'], {
        encoding: 'utf8',
      });
      for (const { body } of JSON.parse(json)) {
        for (const m of (body || '').matchAll(/autofix-key:\s*([\w-]+)/g)) keys.add(m[1]);
      }
    } catch (err) {
      notes.push(`Could not list open ${args[0]}s (${err.message.split('\n')[0]}).`);
    }
  }
  return keys;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function safely(name, fn) {
  try {
    return await fn();
  } catch (err) {
    notes.push(`${name} failed: ${err.message}`);
    return [];
  }
}

const handled = handledKeys();
const items = [
  ...(await safely('Sentry', collectSentry)),
  ...(await safely('Feedback/tickets', collectUserReports)),
].map((item) => ({ ...item, already_handled: handled.has(item.key) }));

const inbox = {
  generated_at: new Date().toISOString(),
  window: { since, hours: windowHours },
  counts: {
    total: items.length,
    sentry: items.filter((i) => i.source === 'sentry').length,
    feedback: items.filter((i) => i.source === 'feedback').length,
    ticket: items.filter((i) => i.source === 'ticket').length,
    already_handled: items.filter((i) => i.already_handled).length,
  },
  notes,
  items,
};

writeFileSync(out, `${JSON.stringify(inbox, null, 2)}\n`);
console.log(`Wrote ${out}: ${JSON.stringify(inbox.counts)}`);
for (const n of notes) console.log(`note: ${n}`);
