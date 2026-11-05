import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/api/openapi.json lists every /api route — public, admin, cron and
// webhook alike — so nothing is reachable without being written down. This
// fails when a route is added, removed or changes its auth helper without the
// spec being regenerated:
//
//   node scripts/generate-openapi.mjs

const ROOT = join(__dirname, '../../../..');
const API_DIR = join(ROOT, 'apps/web/src/app/api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === 'route.ts' ? [p] : [];
  });
}

describe('OpenAPI spec', () => {
  it('is current with the route files', () => {
    expect(() =>
      execFileSync('node', [join(ROOT, 'scripts/generate-openapi.mjs'), '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('documents every exported handler of every route', () => {
    const spec = JSON.parse(readFileSync(join(ROOT, 'docs/api/openapi.json'), 'utf8'));
    const missing: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(API_DIR, join(file, '..')).split(sep).join('/');
      const path = ('/api/' + rel).replace(/\[([^\]]+)\]/g, '{$1}');
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${m}\\b|const\\s+${m}\\s*=)`).test(src)) {
          if (!spec.paths[path]?.[m.toLowerCase()]) missing.push(`${m} ${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('never labels an admin route as public', () => {
    const spec = JSON.parse(readFileSync(join(ROOT, 'docs/api/openapi.json'), 'utf8'));
    const wrong = Object.entries(spec.paths as Record<string, Record<string, any>>)
      .filter(([p]) => p.startsWith('/api/admin/'))
      .flatMap(([p, ops]) =>
        Object.entries(ops)
          .filter(([m, op]) => m !== 'parameters' && !['admin', 'superAdmin'].includes(op['x-access']))
          .map(([m]) => `${m.toUpperCase()} ${p}`),
      );
    expect(wrong).toEqual([]);
  });
});
