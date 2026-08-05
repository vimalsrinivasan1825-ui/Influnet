import { describe, it, expect } from 'vitest';
import { phoneKey, toE164India } from '@/lib/phone';

/**
 * The reported bug, exactly: an account created in the mobile app stored
 * '+91 8270942966'; the web signup form asked about '8270942966'; the DB
 * compared the two as strings and answered "available", so one person could
 * register the same number twice.
 *
 * phoneKey is the TypeScript twin of public.phone_key() (migration 107). These
 * cases are the contract both sides have to keep.
 */
describe('phoneKey', () => {
  it('folds every shape the clients actually wrote into one key', () => {
    const shapes = [
      '+91 8270942966', // mobile signup
      '8270942966', // web signup form
      '+918270942966', // older rows
      '91 82709 42966',
      '08270942966', // STD-dialled
      '+91-82709-42966',
    ];
    const keys = new Set(shapes.map(phoneKey));
    expect(keys).toEqual(new Set(['8270942966']));
  });

  it('keeps different numbers apart', () => {
    expect(phoneKey('+91 8270942966')).not.toBe(phoneKey('+91 8870520006'));
  });

  it('is empty for nothing, so a NULL column never matches a NULL input', () => {
    expect(phoneKey(null)).toBe('');
    expect(phoneKey(undefined)).toBe('');
    expect(phoneKey('')).toBe('');
    // Short input yields a short key, which the SQL rejects before comparing.
    expect(phoneKey('12345')).toBe('12345');
  });
});

describe('toE164India', () => {
  it('writes one shape whatever the client sent', () => {
    expect(toE164India('8270942966')).toBe('+918270942966');
    expect(toE164India('+91 8270942966')).toBe('+918270942966');
    expect(toE164India('918270942966')).toBe('+918270942966');
    expect(toE164India('08270942966')).toBe('+918270942966');
    expect(toE164India(' +91-82709-42966 ')).toBe('+918270942966');
  });

  it('leaves anything it does not recognise alone rather than mangling it', () => {
    // Normalising is not validating: a number this function cannot place must
    // survive intact so the schema can reject it and the user can see what they
    // typed, rather than being silently turned into a different number.
    expect(toE164India('+1 415 555 0134')).toBe('+1 415 555 0134');
    expect(toE164India('not a number')).toBe('not a number');
  });

  it('round-trips to the same key it started with', () => {
    for (const raw of ['8270942966', '+91 8270942966', '918270942966']) {
      expect(phoneKey(toE164India(raw))).toBe(phoneKey(raw));
    }
  });
});
