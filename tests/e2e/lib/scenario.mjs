// Findings recorder shared by every audit scenario script.
//
// A "check" is an assertion with a name, a severity if it fails, and — always —
// the observed value. The observed value is the point: a report that says
// "concurrency test failed" is useless, one that says "4 simultaneous requests
// produced 4 rows where 1 was expected" is actionable.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const E2E_ROOT = join(__dirname, '..');
export const STATE_DIR = join(E2E_ROOT, 'state');
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export class Scenario {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.checks = [];
    this.findings = [];
    this.startedAt = new Date().toISOString();
    this._section = 'general';
  }

  section(name) {
    this._section = name;
    console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
  }

  /** Record a passing/failing expectation. `observed` is always kept. */
  check(name, passed, { severity = 'MEDIUM', observed, expected, note } = {}) {
    const rec = {
      section: this._section, name, passed: Boolean(passed),
      severity: passed ? null : severity, observed, expected, note,
    };
    this.checks.push(rec);
    if (!passed) this.findings.push(rec);
    const mark = passed ? '  ok  ' : ` ${severity.padEnd(4).slice(0, 4)} `;
    console.log(`${mark} ${name}`);
    if (!passed) {
      if (expected !== undefined) console.log(`        expected: ${fmt(expected)}`);
      if (observed !== undefined) console.log(`        observed: ${fmt(observed)}`);
      if (note) console.log(`        note: ${note}`);
    }
    return rec.passed;
  }

  /** Record something observed that isn't pass/fail — context for the report. */
  note(name, observed) {
    this.checks.push({ section: this._section, name, passed: true, observed, kind: 'note' });
    console.log(`  ..    ${name}: ${fmt(observed)}`);
  }

  finish() {
    const out = {
      id: this.id, title: this.title,
      startedAt: this.startedAt, finishedAt: new Date().toISOString(),
      total: this.checks.length,
      failed: this.findings.length,
      bySeverity: Object.fromEntries(
        SEVERITIES.map((s) => [s, this.findings.filter((f) => f.severity === s).length])
      ),
      checks: this.checks,
    };
    writeFileSync(join(STATE_DIR, `${this.id}.json`), JSON.stringify(out, null, 2));
    console.log(`\n${this.title}: ${this.checks.length - this.findings.length}/${this.checks.length} passed`);
    if (this.findings.length) {
      const counts = SEVERITIES
        .map((s) => [s, this.findings.filter((f) => f.severity === s).length])
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s}`)
        .join(', ');
      console.log(`Findings: ${counts}`);
    }
    return out;
  }
}

function fmt(v) {
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v;
  try {
    const s = JSON.stringify(v);
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  } catch {
    return String(v);
  }
}

/** Load the personas seeded by seed-personas.mjs. */
export function loadPersonaState() {
  const p = join(STATE_DIR, 'personas.json');
  if (!existsSync(p)) {
    throw new Error('No state/personas.json — run tests/e2e/seed-personas.mjs first');
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function saveState(name, data) {
  writeFileSync(join(STATE_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

export function loadState(name) {
  const p = join(STATE_DIR, `${name}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
