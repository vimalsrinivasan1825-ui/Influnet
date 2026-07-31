import { describe, it, expect } from 'vitest';

/**
 * Safety logic for scripts/purge-test-data.mjs.
 *
 * This script deletes production rows, so the two properties that matter are:
 *   1. the email patterns match ONLY generated test accounts, and
 *   2. it refuses to run when a test row shares a request or project with a
 *      real account (deleting it would take real history with it).
 */

const isSeeded = (e = '') => /^test(brand|creator)_\d+@influnet\.com$/i.test(e);
const isE2E = (e = '') => /@influnet-e2e\.com$/i.test(e);
const isTest = (e = '') => isSeeded(e) || isE2E(e);

type Row = { a: string; b: string };
const touches = (ids: Set<string>, r: Row) => ids.has(r.a) || ids.has(r.b);

/** Mirrors the script's abort condition. */
function isEntangled(doomed: Set<string>, keep: Set<string>, rows: Row[]) {
  return rows.filter((r) => touches(doomed, r) && touches(keep, r)).length > 0;
}

describe('test-account matching', () => {
  it('matches the generated seed accounts', () => {
    expect(isTest('testbrand_138574@influnet.com')).toBe(true);
    expect(isTest('testcreator_138574@influnet.com')).toBe(true);
    expect(isTest('e2e.mrbeast.0714@influnet-e2e.com')).toBe(true);
  });

  it('does NOT match any of the real accounts', () => {
    for (const email of [
      'admin@influnet.com',
      'arjun@jvsystem.gmail.com',
      'vimal@gmail.com',
      'a2d@gmail.com',
      'auragold@gmail.com',
      'vnkamalesh@gmail.com',
      'kamalesh@tecstellar.com',
      'christopher@socmed.io',
    ]) {
      expect(isTest(email), email).toBe(false);
    }
  });

  it('does not match lookalikes that are not generated accounts', () => {
    // No digits, wrong domain, or a real person who happens to start with "test".
    expect(isTest('testbrand@influnet.com')).toBe(false);
    expect(isTest('testcreator_abc@influnet.com')).toBe(false);
    expect(isTest('testbrand_123@gmail.com')).toBe(false);
    expect(isTest('tester@influnet.com')).toBe(false);
    expect(isTest('contest_123@influnet.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isTest('TestBrand_999@Influnet.com')).toBe(true);
  });
});

describe('entanglement guard', () => {
  const doomed = new Set(['test-1', 'test-2']);
  const keep = new Set(['real-1', 'real-2']);

  it('allows deletion when test rows only involve test accounts', () => {
    expect(isEntangled(doomed, keep, [{ a: 'test-1', b: 'test-2' }])).toBe(false);
  });

  it('ABORTS when a test account shares a row with a real account', () => {
    expect(isEntangled(doomed, keep, [{ a: 'test-1', b: 'real-1' }])).toBe(true);
  });

  it('aborts regardless of which side the real account is on', () => {
    expect(isEntangled(doomed, keep, [{ a: 'real-2', b: 'test-2' }])).toBe(true);
  });

  it('ignores rows between two real accounts', () => {
    expect(isEntangled(doomed, keep, [{ a: 'real-1', b: 'real-2' }])).toBe(false);
  });

  it('aborts if even one row out of many is entangled', () => {
    expect(
      isEntangled(doomed, keep, [
        { a: 'test-1', b: 'test-2' },
        { a: 'test-2', b: 'test-1' },
        { a: 'test-1', b: 'real-1' },
      ]),
    ).toBe(true);
  });
});
