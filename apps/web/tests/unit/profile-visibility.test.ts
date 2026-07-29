/**
 * isSectionVisible() — the one function every visibility check in the app goes
 * through (Settings, the mobile toggles, /c/[username], /api/creators/[username]).
 * The rule that matters: a key nobody has touched yet must read as visible, or
 * every existing profile would go blank the moment migration 088 lands.
 */
import { describe, it, expect } from 'vitest';
import { isSectionVisible, PROFILE_SECTIONS } from '@influnet/core';

describe('isSectionVisible', () => {
  it('defaults every section to visible on an untouched profile', () => {
    for (const key of PROFILE_SECTIONS) {
      expect(isSectionVisible({}, key)).toBe(true);
      expect(isSectionVisible(null, key)).toBe(true);
      expect(isSectionVisible(undefined, key)).toBe(true);
    }
  });

  it('defaults an unrecognised key to visible too', () => {
    // A fourth section added later, read by an older client that doesn't know
    // its name, must still default to shown rather than silently hidden.
    expect(isSectionVisible({ some_future_section: false } as any, 'portfolio' as any)).toBe(true);
  });

  it('respects an explicit false', () => {
    expect(isSectionVisible({ portfolio: false }, 'portfolio')).toBe(false);
  });

  it('respects an explicit true and leaves the other keys at their default', () => {
    const vis = { instagram_posts: false };
    expect(isSectionVisible(vis, 'instagram_posts')).toBe(false);
    expect(isSectionVisible(vis, 'youtube_videos')).toBe(true);
    expect(isSectionVisible(vis, 'portfolio')).toBe(true);
  });
});
