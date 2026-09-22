import { describe, expect, it } from 'vitest';
import { movedProfileRedirect, parseMovedUsernames } from '@/lib/moved-profiles';

const on = { usernames: 'giresh' };
const go = (path: string, env = on, host?: string) =>
  movedProfileRedirect(new URL(`https://dev.influnet.io${path}`), env, host)?.toString() ?? null;

describe('movedProfileRedirect', () => {
  it('forwards a moved profile to the same path on staging', () => {
    expect(go('/giresh')).toBe('https://staging.influnet.io/giresh');
    expect(go('/Giresh')).toBe('https://staging.influnet.io/giresh');
    expect(go('/giresh/media-kit')).toBe('https://staging.influnet.io/giresh/media-kit');
  });

  it('keeps the query string and folds the legacy /c/ link into the canonical one', () => {
    expect(go('/giresh?utm_source=ig')).toBe('https://staging.influnet.io/giresh?utm_source=ig');
    expect(go('/c/giresh')).toBe('https://staging.influnet.io/giresh');
  });

  it('leaves every other path alone', () => {
    for (const p of ['/', '/madangowri', '/gireshx', '/dashboard', '/login', '/b/giresh', '/c/other']) {
      expect(go(p)).toBeNull();
    }
  });

  it('is off when nothing is configured', () => {
    expect(go('/giresh', { usernames: '' })).toBeNull();
    expect(go('/giresh', { usernames: undefined as unknown as string })).toBeNull();
  });

  it('honours a custom target and refuses anything unsafe', () => {
    expect(go('/giresh', { usernames: 'giresh', target: 'https://app.influnet.io' } as never)).toBe(
      'https://app.influnet.io/giresh',
    );
    expect(go('/giresh', { usernames: 'giresh', target: 'http://evil.test' } as never)).toBeNull();
    expect(go('/giresh', { usernames: 'giresh', target: 'not a url' } as never)).toBeNull();
  });

  it('can never redirect a deployment to itself', () => {
    // Same host in the URL.
    expect(
      movedProfileRedirect(new URL('https://staging.influnet.io/giresh'), { usernames: 'giresh' }),
    ).toBeNull();
    // Internal platform host in the URL, public host in the header (Railway / Azure).
    expect(
      movedProfileRedirect(new URL('http://0.0.0.0:8080/giresh'), { usernames: 'giresh' }, 'staging.influnet.io'),
    ).toBeNull();
  });
});

describe('parseMovedUsernames', () => {
  it('accepts commas, spaces and @, and drops anything that is not a username', () => {
    expect([...parseMovedUsernames(' @Giresh, madan_1  x ../etc bad-name ')]).toEqual(['giresh', 'madan_1']);
  });
});
