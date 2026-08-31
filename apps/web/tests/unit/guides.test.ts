/**
 * Guided tours — the pure model. The player choreography is visual and verified
 * in the browser; what's tested here is the data-layer logic that decides which
 * guide runs where, and the timeline math the player depends on.
 */
import { describe, it, expect } from 'vitest';
import {
  GUIDES,
  guideById,
  guidesForRoute,
  guidesForMenu,
  timeline,
  captionSteps,
  screensOf,
  buildCameraKeys,
  sampleCamera,
  pointerAt,
  screenOpacityAt,
  stepIndexAt,
  type Rect,
} from '@influnet/core';

describe('registry integrity', () => {
  it('every guide has a unique id, at least one route and one beat', () => {
    const ids = new Set<string>();
    for (const g of GUIDES) {
      expect(g.id, `${g.id} duplicated`).not.toBe(undefined);
      expect(ids.has(g.id)).toBe(false);
      ids.add(g.id);
      expect(g.routes.length).toBeGreaterThan(0);
      expect(g.beats.length).toBeGreaterThan(0);
      for (const b of g.beats) expect(b.ms).toBeGreaterThan(0);
    }
  });

  it('guideById round-trips', () => {
    for (const g of GUIDES) expect(guideById(g.id)).toBe(g);
    expect(guideById('nope')).toBeUndefined();
  });
});

describe('guidesForRoute', () => {
  it('prefix-matches and orders most-specific route first', () => {
    const hits = guidesForRoute('/dashboard/profile', 'influencer');
    expect(hits.map((g) => g.id)).toContain('connect-socials');
    // '/dashboard/profile' (more specific) should rank ahead of a bare '/dashboard' guide
    const specific = hits.findIndex((g) => g.routes.includes('/dashboard/profile'));
    const broad = hits.findIndex((g) => g.routes.includes('/dashboard') && !g.routes.includes('/dashboard/profile'));
    if (specific >= 0 && broad >= 0) expect(specific).toBeLessThan(broad);
  });

  it('connect-instagram only auto-runs on the dedicated verification route', () => {
    expect(guidesForRoute('/verification', 'influencer').map((g) => g.id)).toContain('connect-instagram');
    expect(guidesForRoute('/dashboard/profile', 'influencer').map((g) => g.id)).not.toContain('connect-instagram');
  });

  it('respects role scoping', () => {
    expect(guidesForRoute('/dashboard/requests', 'business_owner').map((g) => g.id)).toContain('send-request');
    expect(guidesForRoute('/dashboard/requests', 'influencer').map((g) => g.id)).not.toContain('send-request');
    expect(guidesForRoute('/dashboard/requests', 'influencer').map((g) => g.id)).toContain('respond-request');
  });

  it('does not match a sibling route by string prefix', () => {
    // '/dashboard/profile-viewers' must not match a guide registered for '/dashboard/profile'
    const hits = guidesForRoute('/dashboard/profile-viewers', 'influencer').map((g) => g.id);
    expect(hits).not.toContain('connect-socials');
    expect(hits).not.toContain('edit-profile');
  });

  it('ignores query and hash and trailing slashes', () => {
    const a = guidesForRoute('/dashboard/messages/', 'influencer');
    const b = guidesForRoute('/dashboard/messages?conv=1#x', 'influencer');
    expect(a.map((g) => g.id)).toEqual(b.map((g) => g.id));
    expect(a.map((g) => g.id)).toContain('send-message');
  });
});

describe('guidesForMenu', () => {
  it('groups by category, drops empty groups, hides role-locked guides', () => {
    const menu = guidesForMenu('business_owner');
    const flat = menu.flatMap((s) => s.guides.map((g) => g.id));
    expect(flat).toContain('send-request');
    expect(flat).not.toContain('connect-instagram'); // influencer-only
    for (const section of menu) expect(section.guides.length).toBeGreaterThan(0);
  });
});

describe('timeline math', () => {
  const script = guideById('connect-instagram')!;

  it('timeline starts are cumulative and total is the sum', () => {
    const { starts, total } = timeline(script);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBe(starts[i - 1] + script.beats[i - 1].ms);
    }
    expect(total).toBe(script.beats.reduce((s, b) => s + b.ms, 0));
  });

  it('captionSteps are ordered, de-duped and within the loop', () => {
    const steps = captionSteps(script);
    const { total } = timeline(script);
    expect(steps.length).toBeGreaterThan(1);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].at).toBeGreaterThan(steps[i - 1].at);
      expect(steps[i].label).not.toBe(steps[i - 1].label);
    }
    expect(steps[steps.length - 1].at).toBeLessThan(total);
  });

  it('stepIndexAt walks forward and clamps at the ends', () => {
    const steps = captionSteps(script);
    expect(stepIndexAt(steps, -100)).toBe(0);
    expect(stepIndexAt(steps, steps[2].at + 1)).toBe(2);
    expect(stepIndexAt(steps, 1e9)).toBe(steps.length - 1);
  });

  it('screensOf lists each screen once', () => {
    const screens = screensOf(script);
    expect(new Set(screens).size).toBe(screens.length);
    expect(screens).toContain('inf-verify');
    expect(screens).toContain('ig-edit');
  });
});

describe('camera + pointer sampling', () => {
  const script = guideById('send-message')!;
  const view = { w: 320, h: 330 };
  const phone: Rect = { x: 40, y: 15, w: 240, h: 300 };
  const rects: Record<string, Rect | null> = {
    'msg-conversation': { x: 60, y: 80, w: 200, h: 40 },
    'chat-input': { x: 60, y: 250, w: 180, h: 30 },
    'chat-send': { x: 240, y: 250, w: 30, h: 30 },
    'chat-deal-bar': { x: 55, y: 45, w: 210, h: 28 },
  };

  it('buildCameraKeys is monotonic in time and starts wide', () => {
    const keys = buildCameraKeys(script, rects, view, phone);
    for (let i = 1; i < keys.length; i++) expect(keys[i][0]).toBeGreaterThanOrEqual(keys[i - 1][0]);
    expect(keys[0][0]).toBe(0);
    const { total } = timeline(script);
    expect(keys[keys.length - 1][0]).toBe(total);
  });

  it('sampleCamera never zooms out past 1 and stays finite', () => {
    const keys = buildCameraKeys(script, rects, view, phone);
    const { total } = timeline(script);
    for (let t = 0; t <= total; t += 250) {
      const c = sampleCamera(keys, t);
      expect(c.s).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    }
  });

  it('pointer is hidden on beats with no tap and visible mid-tap', () => {
    const { starts } = timeline(script);
    // beat 0 has no tap
    expect(pointerAt(script, rects, view, starts[0] + 100).visible).toBe(false);
    // beat 1 taps msg-conversation — halfway through it the finger should be shown
    const mid = starts[1] + script.beats[1].ms * 0.5;
    expect(pointerAt(script, rects, view, mid).visible).toBe(true);
  });

  it('screenOpacityAt peaks at 1 while its screen is on and is 0 far outside', () => {
    const { starts } = timeline(script);
    const midChat = starts[2] + script.beats[2].ms * 0.5;
    expect(screenOpacityAt(script, 'inf-chat', midChat)).toBeGreaterThan(0.9);
    expect(screenOpacityAt(script, 'inf-messages', midChat)).toBeLessThan(0.1);
  });
});
