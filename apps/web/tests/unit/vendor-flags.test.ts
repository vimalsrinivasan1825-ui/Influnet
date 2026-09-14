import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The property under test is the DEFAULT, not the plumbing: a vendor with no
 * row must read as ON. Getting this backwards would silently disable payments
 * on any environment that had not seeded the table — which is every
 * environment, since migration 149 seeds nothing.
 */
let rows: { key: string; enabled: boolean }[] = [];
let selectError: { code?: string; message?: string } | null = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: async () => ({ data: selectError ? null : rows, error: selectError }),
    }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

async function fresh() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  return import('@/lib/feature-flags');
}

describe('vendorEnabled', () => {
  beforeEach(() => {
    rows = [];
    selectError = null;
  });

  it('defaults a vendor with no row to ON', async () => {
    const { vendorEnabled } = await fresh();
    expect(vendorEnabled('vendor_razorpay')).toBe(true);
  });

  it('is ON before the first snapshot has even loaded', async () => {
    const { vendorEnabled } = await fresh();
    // Called synchronously, before any await lets the background load finish.
    expect(vendorEnabled('vendor_stream')).toBe(true);
  });

  it('turns OFF only on an explicit enabled=false row', async () => {
    rows = [{ key: 'vendor_apify', enabled: false }];
    const { vendorEnabled, allVendors } = await fresh();
    await new Promise((r) => setTimeout(r, 0));
    allVendors();
    await new Promise((r) => setTimeout(r, 0));
    expect(vendorEnabled('vendor_apify')).toBe(false);
    expect(vendorEnabled('vendor_razorpay')).toBe(true);
  });

  it('stays ON when the table cannot be read at all', async () => {
    selectError = { code: '42P01', message: 'relation "feature_flags" does not exist' };
    const { vendorEnabled } = await fresh();
    await new Promise((r) => setTimeout(r, 0));
    expect(vendorEnabled('vendor_razorpay')).toBe(true);
  });

  it('reports only deliberately disabled vendors', async () => {
    rows = [
      { key: 'vendor_apify', enabled: false },
      { key: 'vendor_stream', enabled: true },
    ];
    const { disabledVendors, allVendors } = await fresh();
    await new Promise((r) => setTimeout(r, 0));
    allVendors();
    await new Promise((r) => setTimeout(r, 0));
    expect(disabledVendors()).toEqual(['vendor_apify']);
  });

  it('keeps product-flag defaults separate — those stay FALSE with no row', async () => {
    const { flag } = await fresh();
    delete process.env.SUBSCRIPTIONS_ENABLED;
    expect(flag('subscriptions')).toBe(false);
  });

  it('never lets a vendor row trip the staging boot guard', async () => {
    rows = [{ key: 'vendor_apify', enabled: false }];
    const { explicitlyDisabled } = await fresh();
    // explicitlyDisabled guards boot and must consider PRODUCT flags only.
    await expect(explicitlyDisabled()).resolves.toEqual([]);
  });
});
