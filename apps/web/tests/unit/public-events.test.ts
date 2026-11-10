import { describe, expect, it, vi } from 'vitest';
import { closedEventName } from '@/lib/public-events';

// Both routes must refuse a closed event BEFORE the database is touched, so
// the service-role client is a tripwire: any call to it fails the test.
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/service', () => ({
  serviceRoleClient: vi.fn(() => {
    throw new Error('a closed event must not reach the database');
  }),
}));

const post = (path: string, body: unknown) =>
  new Request(`https://dev.influnet.io${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('closedEventName', () => {
  it('knows the finished event and nothing else', () => {
    expect(closedEventName('silicon-nexus-s2')).toBe('Silicon Nexus S2');
    expect(closedEventName(' silicon-nexus-s2 ')).toBe('Silicon Nexus S2');
    for (const v of ['next-event', '', null, undefined, 42, {}]) expect(closedEventName(v)).toBeNull();
  });
});

describe('public event endpoints for a closed event', () => {
  it('event-pass refuses with 410 and no field, so the form shows it', async () => {
    const { POST } = await import('@/app/api/event-pass/route');
    const res = await POST(
      post('/api/event-pass', { event: 'silicon-nexus-s2', name: 'Asha', phone: '9876543210' }),
    );
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toMatch(/closed/i);
    expect(json.field).toBeUndefined();
    expect(json.passCode).toBeUndefined();
    // The landing site is another origin: without this it reads as a network error.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('event-survey refuses lookup and submit alike', async () => {
    const { POST } = await import('@/app/api/event-survey/route');
    const lookup = await POST(
      post('/api/event-survey', { action: 'lookup', event: 'silicon-nexus-s2', phone: '9876543210' }),
    );
    expect(lookup.status).toBe(410);
    expect((await lookup.json()).registrant).toBeUndefined();

    const submit = await POST(
      post('/api/event-survey', {
        action: 'submit',
        event: 'silicon-nexus-s2',
        phone: '9876543210',
        role: 'creator',
        answers: { q1: 'x' },
      }),
    );
    expect(submit.status).toBe(410);
  });

  it('still answers an unknown event with a validation error, not 410', async () => {
    const { POST } = await import('@/app/api/event-pass/route');
    const res = await POST(post('/api/event-pass', { event: 'nope', name: 'Asha', phone: '9876543210' }));
    expect(res.status).toBe(400);
  });
});
