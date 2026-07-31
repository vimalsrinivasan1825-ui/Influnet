#!/usr/bin/env node
// Reads every tests/e2e/results/<phaseId>.json and renders the cumulative
// HTML report at docs/e2e-reports/e2e-walkthrough-report.html. Safe to
// re-run any time — it always reflects exactly what's on disk in results/.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR, E2E_ROOT } from './harness.mjs';
import { renderUxRemarksSection } from '../ux-remarks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(E2E_ROOT, '..', '..', 'docs', 'e2e-reports');
const REPORT_PATH = join(REPORT_DIR, 'e2e-walkthrough-report.html');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadPhases() {
  if (!existsSync(RESULTS_DIR)) return [];
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).sort();
  return files
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8')))
    .filter((p) => Array.isArray(p.steps)); // ignore any non-phase JSON that ends up here
}

function statusBadge(status) {
  const cls = status === 'PASS' ? 'ok' : status === 'SKIPPED' ? 'skip' : 'fail';
  return `<span class="badge ${cls}">${status}</span>`;
}

function renderStep(phase, s) {
  const hasFindings = s.status === 'FAIL' || s.consoleErrors.length || s.networkErrors.length || s.pageErrors.length;
  const img = s.screenshot ? `<img src="../../${s.screenshot}" alt="${esc(s.name)}" loading="lazy" />` : '';
  const findingsHtml = hasFindings ? `
    <div class="findings">
      ${s.error ? `<div class="finding-row fail">Assertion failed: ${esc(s.error)}</div>` : ''}
      ${s.skippedReason ? `<div class="finding-row skip">Skipped: ${esc(s.skippedReason)}</div>` : ''}
      ${s.pageErrors.map(e => `<div class="finding-row fail">Page error: ${esc(e)}</div>`).join('')}
      ${s.consoleErrors.map(e => `<div class="finding-row warn">Console error: ${esc(e.slice(0,200))}</div>`).join('')}
      ${s.networkErrors.map(e => `<div class="finding-row warn">Network: ${esc(e)}</div>`).join('')}
    </div>` : '';
  const notesHtml = s.notes.length ? `<div class="notes">${s.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : '';

  return `
    <div class="card ${hasFindings ? 'has-findings' : ''}">
      <span class="step-badge">#${s.step}</span>
      ${statusBadge(s.status)}
      ${img}
      <div class="cap">
        <strong>${esc(s.name)}</strong>
        ${s.url ? `<p class="url">${esc(s.url)}</p>` : ''}
        ${notesHtml}
        ${findingsHtml}
      </div>
    </div>`;
}

export function generateReport() {
  const phases = loadPhases();
  const allSteps = phases.flatMap((p) => p.steps.map((s) => ({ ...s, _phase: p.phaseTitle })));
  const totals = phases.reduce((acc, p) => {
    acc.total += p.summary.total;
    acc.passed += p.summary.passed;
    acc.failed += p.summary.failed;
    acc.skipped += p.summary.skipped;
    acc.findings += p.summary.findings;
    return acc;
  }, { total: 0, passed: 0, failed: 0, skipped: 0, findings: 0 });

  const findingsList = allSteps.filter(s => s.status === 'FAIL' || s.consoleErrors.length || s.networkErrors.length || s.pageErrors.length);

  const phaseSections = phases.map((p) => `
    <section class="phase">
      <h2>${esc(p.phaseTitle)} <span class="phase-stats">${p.summary.passed}/${p.summary.total} passed · ${p.summary.failed} failed · ${p.summary.skipped} skipped</span></h2>
      <div class="grid">${p.steps.map(s => renderStep(p, s)).join('\n')}</div>
    </section>
  `).join('\n');

  const findingsSection = findingsList.length ? `
    <section class="phase findings-summary">
      <h2>Findings <span class="phase-stats">${findingsList.length} item(s) needing attention</span></h2>
      <table class="findings-table">
        <thead><tr><th>Phase</th><th>#</th><th>Step</th><th>Detail</th></tr></thead>
        <tbody>
          ${findingsList.map(s => `
            <tr class="${s.status === 'FAIL' ? 'row-fail' : 'row-warn'}">
              <td>${esc(s._phase)}</td>
              <td>${s.step}</td>
              <td>${esc(s.name)}</td>
              <td>${esc(s.error || [...s.pageErrors, ...s.consoleErrors, ...s.networkErrors].slice(0,2).join(' · ') || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>` : `<section class="phase findings-summary"><h2>Findings <span class="phase-stats">none — all clear</span></h2></section>`;

  const uxSection = renderUxRemarksSection(esc);

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Influnet — Full E2E Audit</title>
<style>
  :root{--bg:#f7f7f9;--surface:#fff;--ink:#17171d;--muted:#6f6c7c;--line:#e7e5ee;--accent:#b23ad1;--ok:#1a9c5b;--fail:#d3374a;--warn:#c98a1d;--skip:#8a87a0}
  @media(prefers-color-scheme:dark){:root{--bg:#101014;--surface:#17171e;--ink:#ecebf3;--muted:#9b99a8;--line:#2a2933;--accent:#e07ff5;--ok:#3ddc8a;--fail:#ff6b7d;--warn:#f0b64c;--skip:#a5a2b8}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;font-size:15px;line-height:1.55}
  .w{max-width:1300px;margin:0 auto;padding:36px 24px 80px}
  h1{font-size:28px;font-weight:800;letter-spacing:-.03em;margin:0 0 8px}
  h2{font-size:19px;font-weight:800;margin:0 0 14px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .phase-stats{font-size:12px;font-weight:600;color:var(--muted);text-transform:none}
  .lede{color:var(--muted);max-width:70ch}
  .stats{display:flex;gap:16px;margin:20px 0 32px;flex-wrap:wrap}
  .stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 20px}
  .stat-n{font-size:24px;font-weight:800}.stat-l{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .stat-n.fail{color:var(--fail)}.stat-n.ok{color:var(--ok)}.stat-n.skip{color:var(--skip)}
  .phase{margin-bottom:44px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;position:relative}
  .card.has-findings{border-color:var(--fail)}
  .step-badge{position:absolute;top:10px;left:10px;z-index:2;background:rgba(0,0,0,.55);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px}
  .badge{position:absolute;top:10px;right:10px;z-index:2;font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;color:#fff}
  .badge.ok{background:var(--ok)}.badge.fail{background:var(--fail)}.badge.skip{background:var(--skip)}
  .card img{width:100%;display:block;border-bottom:1px solid var(--line);background:#ddd}
  .cap{padding:12px 16px 16px}
  .cap strong{font-size:13px;display:block;margin-bottom:4px}
  .cap .url{margin:0 0 6px;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;word-break:break-all}
  .notes p{margin:2px 0;font-size:12px;color:var(--muted)}
  .findings{margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}
  .finding-row{font-size:11.5px;font-family:ui-monospace,monospace;padding:3px 6px;border-radius:6px;margin-bottom:4px;word-break:break-word}
  .finding-row.fail{background:rgba(211,55,74,.12);color:var(--fail)}
  .finding-row.warn{background:rgba(201,138,29,.12);color:var(--warn)}
  .finding-row.skip{background:rgba(138,135,160,.12);color:var(--skip)}
  .findings-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .findings-table th,.findings-table td{text-align:left;padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line)}
  .findings-table tr.row-fail td:last-child{color:var(--fail)}
  .findings-table tr.row-warn td:last-child{color:var(--warn)}
  footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
  .ux-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
  .ux-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative}
  .ux-card.ux-strength{border-left:3px solid var(--ok)}
  .ux-card.ux-rough{border-left:3px solid var(--warn)}
  .ux-card.ux-suggestion{border-left:3px solid var(--accent)}
  .ux-tone{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:99px;margin-bottom:8px}
  .ux-strength .ux-tone{background:rgba(26,156,91,.14);color:var(--ok)}
  .ux-rough .ux-tone{background:rgba(201,138,29,.14);color:var(--warn)}
  .ux-suggestion .ux-tone{background:rgba(178,58,209,.14);color:var(--accent)}
  .ux-card strong{display:block;font-size:13.5px;margin-bottom:6px}
  .ux-card p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.55}
</style></head><body>
<div class="w">
  <h1>Influnet — Full E2E Audit</h1>
  <p class="lede">Every step below carries a real pass/fail verdict — recorded from actual page state and DB assertions, never written in advance. Findings (failures, console errors, 4xx/5xx responses) are surfaced per-step and rolled up below.</p>
  <div class="stats">
    <div class="stat"><div class="stat-n">${totals.total}</div><div class="stat-l">Total steps</div></div>
    <div class="stat"><div class="stat-n ok">${totals.passed}</div><div class="stat-l">Passed</div></div>
    <div class="stat"><div class="stat-n fail">${totals.failed}</div><div class="stat-l">Failed</div></div>
    <div class="stat"><div class="stat-n skip">${totals.skipped}</div><div class="stat-l">Skipped</div></div>
    <div class="stat"><div class="stat-n fail">${totals.findings}</div><div class="stat-l">Findings</div></div>
    <div class="stat"><div class="stat-n">${new Date().toLocaleDateString()}</div><div class="stat-l">Generated</div></div>
  </div>
  ${findingsSection}
  ${uxSection}
  ${phaseSections}
  <footer>Generated by the Influnet E2E audit harness (tests/e2e/lib) · assertions verified against live DB state, not narrated.</footer>
</div></body></html>`;

  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, html);
  console.log(`\n✅ Report regenerated: docs/e2e-reports/e2e-walkthrough-report.html`);
  console.log(`   ${totals.passed}/${totals.total} passed, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.findings} findings.\n`);
  return REPORT_PATH;
}

// Allow running directly: node tests/e2e/lib/report.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport();
}
