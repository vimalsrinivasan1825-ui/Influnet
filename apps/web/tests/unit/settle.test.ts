import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Sentry is a side effect here, not the subject — stub it and assert it was told.
const captureException = vi.fn();
vi.mock('@/lib/observability', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { settleAll, settleOne } from '@/lib/settle';

describe('settleAll', () => {
  beforeEach(() => captureException.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('returns every value in order when nothing fails', async () => {
    const out = await settleAll(
      [Promise.resolve('a'), Promise.resolve(2), Promise.resolve(null)],
      { route: '/api/test' },
    );
    expect(out).toEqual(['a', 2, null]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('keeps the survivors when one rejects — the whole point', async () => {
    const out = await settleAll(
      [Promise.resolve('kept'), Promise.reject(new Error('vendor down')), Promise.resolve('also kept')],
      { route: '/api/home' },
    );
    expect(out).toEqual(['kept', null, 'also kept']);
  });

  it('survives every single one failing', async () => {
    const out = await settleAll(
      [Promise.reject(new Error('a')), Promise.reject(new Error('b'))],
      { route: '/api/home' },
    );
    expect(out).toEqual([null, null]);
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it('reports a failure with the route and the slot label', async () => {
    await settleAll([Promise.reject(new Error('boom'))], {
      route: '/api/home',
      labels: ['instagram'],
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0] as [Error, any];
    expect(err.message).toBe('boom');
    expect(ctx.tags).toMatchObject({ route: '/api/home', degraded: 'instagram' });
  });

  it('falls back to a positional label when none is given', async () => {
    await settleAll([Promise.resolve(1), Promise.reject(new Error('x'))], { route: '/api/x' });
    expect((captureException.mock.calls[0][1] as any).tags.degraded).toBe('slot_1');
  });

  it('does not reject even though a member did', async () => {
    await expect(
      settleAll([Promise.reject(new Error('nope'))], { route: '/api/x' }),
    ).resolves.toBeDefined();
  });
});

describe('settleOne', () => {
  beforeEach(() => captureException.mockClear());

  it('passes the value through untouched', async () => {
    await expect(settleOne(Promise.resolve('v'), { route: '/api/x' })).resolves.toBe('v');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('returns null by default when the promise rejects', async () => {
    await expect(settleOne(Promise.reject(new Error('e')), { route: '/api/x' })).resolves.toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('returns the caller-supplied fallback instead of null when given one', async () => {
    const out = await settleOne(Promise.reject(new Error('e')), { route: '/api/x' }, []);
    expect(out).toEqual([]);
  });
});
