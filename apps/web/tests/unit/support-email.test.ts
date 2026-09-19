import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_EMAIL } from '@influnet/core';

/**
 * influnet.in has no mail server (no MX record): anything mailed to an
 * @influnet.in address bounces. Users trying to reach support or delete their
 * account by email were writing into the void. The address lives in ONE place
 * (SUPPORT_EMAIL) and no source file may spell the dead domain as a mailbox.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const DIRS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib', 'apps/landing/src', 'packages/core/src'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe('support mailbox', () => {
  it('is on the domain that actually receives mail', () => {
    expect(SUPPORT_EMAIL).toBe('support@influnet.io');
  });

  it('is never spelled as a mailbox on the dead domain influnet.in', () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      for (const f of walk(join(ROOT, d))) {
        if (/[A-Za-z0-9._-]+@influnet\.in\b/.test(readFileSync(f, 'utf8'))) offenders.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });
});
