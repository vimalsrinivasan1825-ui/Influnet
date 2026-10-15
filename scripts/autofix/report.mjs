#!/usr/bin/env node
/**
 * Nightly autofix — step 3: report.
 *
 * Reads autofix-inbox.json (from collect) and autofix-report.json (from
 * Claude), checks that every inbox item got a decision, writes a table to the
 * GitHub job summary, and sends ONE short Telegram line: counts and a link to
 * the run. No error text or user text goes to Telegram.
 *
 * Exits 1 when the report is missing or unreadable, so a broken run shows red
 * in Actions instead of passing quietly.
 *
 * Env:
 *   GITHUB_STEP_SUMMARY, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID (set by Actions)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  optional
 *   AUTOFIX_MODE                          report | pr
 *
 * Usage: node scripts/autofix/report.mjs [inbox-file] [report-file]
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [inboxFile = 'autofix-inbox.json', reportFile = 'autofix-report.json'] = process.argv.slice(2);
const mode = process.env.AUTOFIX_MODE || 'report';
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '(local run)';

function read(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const inbox = read(inboxFile) || { items: [], notes: [`${inboxFile} missing or unreadable.`] };
const report = read(reportFile);

// Markdown table cells: one line, no pipes.
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const lines = [`## Autofix — ${mode} mode`, ''];
let failed = false;

if (!report || !Array.isArray(report.items)) {
  failed = true;
  lines.push(`**Triage produced no readable \`${reportFile}\`.** Check the triage step's log.`, '');
} else {
  const byKey = new Map(inbox.items.map((i) => [i.key, i]));
  const decided = new Set(report.items.map((i) => i.key));
  const missing = inbox.items.filter((i) => !decided.has(i.key)).map((i) => i.key);

  const count = (d) => report.items.filter((i) => i.decision === d).length;
  lines.push(
    `${inbox.items.length} items · **${count('fix')} fix** · **${count('escalate')} escalate** · ` +
      `${count('ignore')} ignore · ${count('skip')} already handled`,
    '',
  );
  if (missing.length) lines.push(`⚠️ No decision for: ${missing.join(', ')}`, '');

  const order = { fix: 0, escalate: 1, ignore: 2, skip: 3 };
  const rank = { high: 0, medium: 1, low: 2 };
  const rows = [...report.items].sort(
    (a, b) => (order[a.decision] ?? 9) - (order[b.decision] ?? 9) || (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9),
  );

  lines.push('| Decision | Sev | Item | What users hit | Cause / reason | Plan | Link |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const src = byKey.get(r.key);
    const item = src?.url ? `[${cell(src.id)}](${src.url})` : cell(r.key);
    const link = r.pr_url ? `[PR](${r.pr_url})` : r.issue_url ? `[issue](${r.issue_url})` : '';
    lines.push(
      `| ${cell(r.decision)} | ${cell(r.severity)} | ${item} | ${cell(r.summary)} | ` +
        `${cell(r.decision === 'fix' ? r.cause : r.reason || r.cause)} | ${cell(r.plan)} | ${link} |`,
    );
  }
  lines.push('');
  if (report.notes) lines.push(`**Notes from triage:** ${cell(report.notes)}`, '');
}

if (inbox.notes?.length) {
  lines.push('**Collector notes:**', ...inbox.notes.map((n) => `- ${n}`), '');
}

const md = lines.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
else console.log(md);

// ── Telegram: counts and a link, nothing else ────────────────────────────────
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  const items = report?.items || [];
  const n = (pred) => items.filter(pred).length;
  const text = failed
    ? `Influnet autofix (${mode}): run failed — no report. ${runUrl}`
    : `Influnet autofix (${mode}): ${inbox.items.length} items — ` +
      `${n((i) => i.decision === 'fix')} fix, ${n((i) => i.decision === 'escalate')} escalate, ` +
      `${n((i) => i.decision === 'ignore')} ignore` +
      (n((i) => i.severity === 'high' && i.decision !== 'ignore' && i.decision !== 'skip')
        ? `, ${n((i) => i.severity === 'high' && i.decision !== 'ignore' && i.decision !== 'skip')} high`
        : '') +
      (mode === 'pr' ? `. PRs: ${n((i) => i.pr_url)}, issues: ${n((i) => i.issue_url)}` : '') +
      `. ${runUrl}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.log(`Telegram send failed: ${res.status}`);
  } catch (err) {
    console.log(`Telegram send failed: ${err.message}`);
  }
}

process.exit(failed ? 1 : 0);
