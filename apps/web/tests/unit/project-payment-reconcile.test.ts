/**
 * The webhook-free path that opens a payment gate (lib/payments/project-payment.ts).
 *
 * Found 2026-10-15: a staging payment was captured by Razorpay but the webhook
 * went to an account nobody could find, so the gate never opened and the
 * business paid twice. reconcileProjectPayments() asks Razorpay directly.
 * These pin the rules it must share with the webhook: only a capture opens a
 * gate, never for less than the ledger amount, and a capture is settled once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/notify', () => ({ notifyUser: vi.fn(async () => {}) }));
vi.mock('@/lib/email/context', () => ({ profileNames: vi.fn(async () => ({})), nameOf: () => 'Creator' }));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/analytics-server', () => ({ captureServer: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/feature-flags', () => ({ vendorEnabled: () => true }));

import { notifyUser } from '@/lib/notify';
import { reconcileProjectPayments, settleCapturedProjectPayment } from '@/lib/payments/project-payment';

type Op = { table: string; op: 'select' | 'update'; values?: unknown; filters: Array<[string, string, unknown]> };

/** A tiny PostgREST stand-in: every awaited chain is answered by `respond`. */
function fakeAdmin(respond: (op: Op) => { data: unknown; error?: unknown }) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, op: 'select', filters: [] };
      const builder: any = {
        select: () => builder,
        update: (values: unknown) => { op.op = 'update'; op.values = values; return builder; },
        eq: (c: string, v: unknown) => { op.filters.push([c, 'eq', v]); return builder; },
        neq: (c: string, v: unknown) => { op.filters.push([c, 'neq', v]); return builder; },
        is: (c: string, v: unknown) => { op.filters.push([c, 'is', v]); return builder; },
        not: (c: string, _o: string, v: unknown) => { op.filters.push([c, 'not', v]); return builder; },
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => builder,
        single: () => builder,
        then: (resolve: (r: unknown) => void, reject: (e: unknown) => void) => {
          ops.push(op);
          try { resolve({ error: null, ...respond(op) }); } catch (e) { reject(e); }
        },
      };
      return builder;
    },
  };
  return { client: client as any, ops };
}

const LEDGER = {
  id: 'pay-1', project_id: 35, stage_key: 'quick_payment', status: 'created',
  amount: 10_000_000, currency: 'INR', payer_id: 'biz-1', razorpay_order_id: 'order_A',
};

function razorpayReturns(byOrder: Record<string, { status: number; items?: unknown[] }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const order = decodeURIComponent(String(url).split('/orders/')[1].split('/')[0]);
    const r = byOrder[order] ?? { status: 404 };
    return new Response(JSON.stringify({ items: r.items ?? [] }), { status: r.status });
  }));
}

/** Default database: one open order, an unopened gate, a project with a creator. */
function standardDb(overrides: { flipped?: unknown[]; open?: unknown[] } = {}) {
  return fakeAdmin((op) => {
    if (op.table === 'project_payments' && op.op === 'select') return { data: overrides.open ?? [LEDGER] };
    if (op.table === 'project_payments' && op.op === 'update') return { data: overrides.flipped ?? [{ id: 'pay-1' }] };
    if (op.table === 'project_stage_items' && op.op === 'select') return { data: { id: 'gate-1' } };
    if (op.table === 'project_stage_items' && op.op === 'update') return { data: null };
    if (op.table === 'campaign_projects') return { data: { title: 'T', owner_user_id: 'biz-1', counterparty_user_id: 'cr-1' } };
    return { data: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = 'secret';
});

describe('reconcileProjectPayments', () => {
  it('settles a captured order: ledger paid, gate opened, creator told once', async () => {
    razorpayReturns({ order_A: { status: 200, items: [{ id: 'pay_X', status: 'captured', amount: 10_000_000, currency: 'INR' }] } });
    const { client, ops } = standardDb();

    expect(await reconcileProjectPayments(client, 35)).toBe(1);

    const flip = ops.find((o) => o.table === 'project_payments' && o.op === 'update')!;
    expect(flip.values).toMatchObject({ status: 'paid', razorpay_payment_id: 'pay_X' });
    expect(flip.filters).toContainEqual(['status', 'neq', 'paid']);
    const gate = ops.find((o) => o.table === 'project_stage_items' && o.op === 'update')!;
    expect(gate.filters).toContainEqual(['id', 'eq', 'gate-1']);
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });

  it('leaves an order alone when Razorpay has no capture for it', async () => {
    razorpayReturns({ order_A: { status: 200, items: [{ id: 'pay_X', status: 'failed', amount: 10_000_000, currency: 'INR' }] } });
    const { client, ops } = standardDb();

    expect(await reconcileProjectPayments(client, 35)).toBe(0);
    expect(ops.some((o) => o.op === 'update')).toBe(false);
  });

  it('skips an order Razorpay does not know (another account, after a key change)', async () => {
    razorpayReturns({ order_A: { status: 400 } });
    const { client, ops } = standardDb();

    expect(await reconcileProjectPayments(client, 35)).toBe(0);
    expect(ops.some((o) => o.op === 'update')).toBe(false);
  });

  it('does nothing when Razorpay is not configured', async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    const { client, ops } = standardDb();
    expect(await reconcileProjectPayments(client, 35)).toBe(0);
    expect(ops).toHaveLength(0);
  });
});

describe('settleCapturedProjectPayment', () => {
  it('never opens a gate for less than the ledger amount', async () => {
    const { client, ops } = standardDb();
    const r = await settleCapturedProjectPayment(client, LEDGER, {
      orderId: 'order_A', paymentId: 'pay_X', amountPaise: 100, currency: 'INR', source: 'reconcile',
    });
    expect(r).toBe('amount-mismatch');
    expect(ops.some((o) => o.op === 'update')).toBe(false);
  });

  it('refuses a capture in a different currency', async () => {
    const { client } = standardDb();
    const r = await settleCapturedProjectPayment(client, LEDGER, {
      orderId: 'order_A', paymentId: 'pay_X', amountPaise: 10_000_000, currency: 'USD', source: 'webhook',
    });
    expect(r).toBe('currency-mismatch');
  });

  it('settles once when the webhook and a reconcile race: the loser opens and notifies nothing', async () => {
    const { client, ops } = standardDb({ flipped: [] });
    const r = await settleCapturedProjectPayment(client, LEDGER, {
      orderId: 'order_A', paymentId: 'pay_X', amountPaise: 10_000_000, currency: 'INR', source: 'webhook',
    });
    expect(r).toBe('already');
    expect(ops.some((o) => o.table === 'project_stage_items')).toBe(false);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
