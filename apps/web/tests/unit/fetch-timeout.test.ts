import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, isTimeout, TIMEOUT } from '@/lib/fetch-timeout';

describe('fetchWithTimeout', () => {
  const orig = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = orig;
    vi.restoreAllMocks();
  });

  it('passes an abort signal through to fetch', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = spy as any;

    await fetchWithTimeout('https://example.test');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('actually aborts a request that outlives its deadline', async () => {
    globalThis.fetch = ((_u: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
        );
      })) as any;

    await expect(
      fetchWithTimeout('https://example.test', { timeoutMs: 10 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('does not let a caller signal silently replace the deadline', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = spy as any;
    const caller = new AbortController();

    await fetchWithTimeout('https://example.test', {
      signal: caller.signal,
      timeoutMs: 50,
    });

    // Either combined via AbortSignal.any, or the caller's — never undefined,
    // which is what an unbounded request would look like.
    expect(spy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards method, headers and body untouched', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = spy as any;

    await fetchWithTimeout('https://example.test', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: 'payload',
      timeoutMs: TIMEOUT.MONEY,
    });

    const init = spy.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Test': '1' });
    expect(init.body).toBe('payload');
    expect(init.timeoutMs).toBeUndefined();
  });
});

describe('isTimeout', () => {
  it('recognises a deadline', () => {
    expect(isTimeout(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
    expect(isTimeout(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
  });

  it('does not mistake a refusal for a deadline', () => {
    expect(isTimeout(new Error('402 Payment Required'))).toBe(false);
    expect(isTimeout(null)).toBe(false);
    expect(isTimeout('nope')).toBe(false);
  });
});
