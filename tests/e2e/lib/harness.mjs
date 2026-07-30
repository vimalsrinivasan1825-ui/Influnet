// Core test-runner engine for the Influnet full E2E audit.
//
// Design principles (fixing what was wrong with the old suite):
//  1. A screenshot's caption is generated from what actually happened in the
//     step (PASS/FAIL/SKIPPED + the thrown error, if any) — never hand-written
//     prose written before the step ran.
//  2. Nothing is swallowed. A missing element, a redirect, a console error, a
//     4xx/5xx network response — every one becomes a recorded finding.
//  3. Every step that mutates data must verify the mutation actually landed in
//     the DB (via lib/db.mjs), not just that the UI didn't crash.
//
// Each phase script creates one Runner, runs a series of `runner.step(...)`
// calls, then calls `runner.finish()` which writes `results/<phaseId>.json`.
// `lib/report.mjs` reads all `results/*.json` files and renders the full
// cumulative HTML report, so phases can be reviewed one at a time.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const E2E_ROOT = join(__dirname, '..');
export const SCREENSHOT_ROOT = join(E2E_ROOT, 'screenshots');
export const RESULTS_DIR = join(E2E_ROOT, 'results');

for (const d of [SCREENSHOT_ROOT, RESULTS_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export class AssertionError extends Error {}

export function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

/** Attach console/network watchers to a page. Call once per page; read via drain(). */
export function watchPage(page) {
  const consoleErrors = [];
  const networkErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      networkErrors.push(`${status} ${res.request().method()} ${res.url()}`);
    }
  });
  return {
    drain() {
      const out = {
        consoleErrors: consoleErrors.splice(0),
        networkErrors: networkErrors.splice(0),
        pageErrors: pageErrors.splice(0),
      };
      return out;
    },
  };
}

export class Runner {
  constructor(phaseId, phaseTitle) {
    this.phaseId = phaseId;
    this.phaseTitle = phaseTitle;
    this.steps = [];
    this.counter = 0;
    this.screenshotDir = join(SCREENSHOT_ROOT, phaseId);
    if (!existsSync(this.screenshotDir)) mkdirSync(this.screenshotDir, { recursive: true });
    this._watchers = new Map();
  }

  watch(page) {
    if (!this._watchers.has(page)) this._watchers.set(page, watchPage(page));
    return this._watchers.get(page);
  }

  async shot(page, label) {
    this.counter++;
    const filename = `${String(this.counter).padStart(2, '0')}-${label}.png`;
    const absPath = join(this.screenshotDir, filename);
    await page.screenshot({ path: absPath, fullPage: true });
    return `tests/e2e/screenshots/${this.phaseId}/${filename}`;
  }

  /**
   * Run one auditable unit of work.
   * `fn(ctx)` receives { page, shot, note } and may throw to fail the step.
   * `page` (optional) — if provided, a screenshot is auto-captured after fn
   * runs (pass or fail) and console/network errors since the last step on
   * that page are attached.
   * fn may return { skipped: 'reason' } to mark the step SKIPPED instead of PASS.
   */
  async step(name, page, fn) {
    if (typeof page === 'function') { fn = page; page = null; } // allow step(name, fn) with no page
    const notes = [];
    const note = (msg) => notes.push(msg);
    let status = 'PASS';
    let error = null;
    let skippedReason = null;
    let screenshotPath = null;
    let consoleErrors = [], networkErrors = [], pageErrors = [];

    try {
      const result = await fn({ page, note });
      if (result && result.skipped) {
        status = 'SKIPPED';
        skippedReason = result.skipped;
      }
    } catch (err) {
      status = 'FAIL';
      error = err.message || String(err);
    }

    if (page) {
      try {
        screenshotPath = await this.shot(page, this._slug(name));
      } catch (shotErr) {
        notes.push(`(screenshot failed: ${shotErr.message})`);
      }
      const watcher = this._watchers.get(page);
      if (watcher) ({ consoleErrors, networkErrors, pageErrors } = watcher.drain());
    }

    const record = {
      step: this.steps.length + 1,
      name,
      status,
      error,
      skippedReason,
      notes,
      screenshot: screenshotPath,
      consoleErrors,
      networkErrors,
      pageErrors,
      url: page ? this._safeUrl(page) : null,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(record);

    const icon = status === 'PASS' ? '✅' : status === 'SKIPPED' ? '⏭️ ' : '❌';
    console.log(`  ${icon} [${this.phaseId} #${record.step}] ${name}${error ? `  — ${error}` : ''}`);
    if (consoleErrors.length) console.log(`      ⚠ console errors: ${consoleErrors.length}`);
    if (networkErrors.length) console.log(`      ⚠ network errors: ${networkErrors.length} (${networkErrors.slice(0, 3).join(' | ')})`);

    return record;
  }

  _slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
  }

  _safeUrl(page) {
    try { return page.url(); } catch { return null; }
  }

  summary() {
    const total = this.steps.length;
    const passed = this.steps.filter((s) => s.status === 'PASS').length;
    const failed = this.steps.filter((s) => s.status === 'FAIL').length;
    const skipped = this.steps.filter((s) => s.status === 'SKIPPED').length;
    const findings = this.steps.filter((s) => s.status === 'FAIL' || s.consoleErrors.length || s.networkErrors.length || s.pageErrors.length).length;
    return { total, passed, failed, skipped, findings };
  }

  finish() {
    const payload = {
      phaseId: this.phaseId,
      phaseTitle: this.phaseTitle,
      generatedAt: new Date().toISOString(),
      summary: this.summary(),
      steps: this.steps,
    };
    const path = join(RESULTS_DIR, `${this.phaseId}.json`);
    writeFileSync(path, JSON.stringify(payload, null, 2));
    const s = this.summary();
    console.log(`\n  Phase "${this.phaseTitle}": ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.skipped} skipped, ${s.findings} findings.`);
    console.log(`  Results written to ${path}\n`);
    return payload;
  }
}
