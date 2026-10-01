import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The store build (eas.json `production` profile) and the over-the-air update job
 * (.github/workflows/mobile-update.yml) each carry their own EXPO_PUBLIC_* values,
 * because an OTA bundles JS with the WORKFLOW's environment, not eas.json's. When
 * they drift, an update silently changes what the store apps do: e.g. it would
 * switch the Pro purchase UI back on inside the App Store / Play Store builds
 * (Apple 3.1.1). These pin the settings that must stay identical.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const easProd = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/eas.json'), 'utf8')).build.production.env as Record<string, string>;
const workflow = readFileSync(join(ROOT, '.github/workflows/mobile-update.yml'), 'utf8');

/** The text of one job in the workflow, up to the next top-level job. */
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:`);
  expect(start, `job ${name} exists`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}
const prodJob = job('update-production');
const envValue = (text: string, key: string) => text.match(new RegExp(`^\\s+${key}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm'))?.[1];

describe('production OTA job vs the eas.json production profile', () => {
  it('hides the Pro purchase in the OTA bundle exactly as the store build does', () => {
    expect(easProd.EXPO_PUBLIC_HIDE_PRO_PURCHASE).toBe('1');
    expect(envValue(prodJob, 'EXPO_PUBLIC_HIDE_PRO_PURCHASE')).toBe('1');
  });

  it('targets the same API as the store build', () => {
    expect(envValue(prodJob, 'EXPO_PUBLIC_API_BASE_URL')).toBe(easProd.EXPO_PUBLIC_API_BASE_URL);
  });

  it('publishes to production only from a manual dispatch or a push to staging — never from dev', () => {
    // Auto-fire on push to staging was reinstated 2026-10-01 at the owner's request
    // (4c4366e3); staging is production. A push to dev must still never reach it.
    const cond = prodJob.match(/^\s+if:\s*(.+)$/m)?.[1] ?? '';
    expect(cond).toMatch(/github\.event_name == 'workflow_dispatch'/);
    expect(cond).toMatch(/github\.event_name == 'push' && github\.ref == 'refs\/heads\/staging'/);
    expect(cond).not.toMatch(/refs\/heads\/(dev|main)/);
    expect(prodJob).toMatch(/environment:\s*production/);
  });

  it('never interpolates a dispatch input into a shell command (script injection)', () => {
    // Inputs must reach the shell through env vars ($ROLLOUT, $MESSAGE), not ${{ inputs.* }} inside `run:`.
    const runBlocks = prodJob.split(/\n\s+env:\n/).map((chunk) => chunk.split(/\n\s+run:/).slice(1).join('\n'));
    for (const block of runBlocks) expect(block).not.toMatch(/\$\{\{[^}]*inputs\./);
    // A push has no inputs, so each falls back to a fixed value — still only via env.
    expect(prodJob).toMatch(/ROLLOUT:\s*\$\{\{[^}\n]*inputs\.rollout_percentage[^}\n]*\}\}/);
    expect(prodJob).toMatch(/MESSAGE:\s*\$\{\{[^}\n]*inputs\.message[^}\n]*\}\}/);
  });
});
