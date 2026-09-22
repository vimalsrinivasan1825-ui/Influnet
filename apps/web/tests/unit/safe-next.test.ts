import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safe-next';

describe('safeNextPath', () => {
  it('keeps same-site paths, query included', () => {
    expect(safeNextPath('/dashboard/requests/new?to=abc')).toBe('/dashboard/requests/new?to=abc');
    expect(safeNextPath('/giresh')).toBe('/giresh');
  });
  it('refuses anything a browser would read as another host', () => {
    for (const bad of ['//evil.test', '/\\evil.test', 'https://evil.test', 'evil.test', '', null, undefined, `/${'a'.repeat(600)}`]) {
      expect(safeNextPath(bad as string)).toBeNull();
    }
  });
});
