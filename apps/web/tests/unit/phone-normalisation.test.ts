import { describe, it, expect } from 'vitest';
import { isValidIndianPhone, phoneKey, sanitizePhoneInput, toE164India } from '@/lib/phone';

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

/**
 * A separate report, same signup screen: the mobile number field took a
 * 26-digit paste and reported it as available. `phoneKey`/`toE164India` only
 * ask "what number is this", never "IS this a number" — isValidIndianPhone is
 * the check that was missing everywhere: the client's Send-OTP gate, the
 * check-phone route, and RegisterProfileSchema (PhoneSchema in validators.ts).
 */
describe('isValidIndianPhone', () => {
  it('accepts a real number in every shape the clients write', () => {
    for (const phone of [
      '8270942966',
      '+91 8270942966',
      '+918270942966',
      '91 82709 42966',
      '08270942966',
      '+91-82709-42966',
    ]) {
      expect(isValidIndianPhone(phone), phone).toBe(true);
    }
  });

  it('rejects the exact garbage from the report', () => {
    expect(isValidIndianPhone('88777899798987979986869869')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidIndianPhone('123456789')).toBe(false); // 9
    expect(isValidIndianPhone('12345678901')).toBe(false); // 11, not 0-prefixed
    expect(isValidIndianPhone('1234567890123')).toBe(false); // 13
  });

  it('rejects a 10-digit string that is not a mobile prefix', () => {
    // Indian mobile numbers start 6-9; landlines and other 10-digit strings
    // starting 0-5 are not mobile numbers this product can OTP-verify.
    expect(isValidIndianPhone('1234567890')).toBe(false);
    expect(isValidIndianPhone('0234567890')).toBe(false);
  });

  it('rejects letters and empty input', () => {
    expect(isValidIndianPhone('not a number')).toBe(false);
    expect(isValidIndianPhone('')).toBe(false);
    expect(isValidIndianPhone(null)).toBe(false);
    expect(isValidIndianPhone(undefined)).toBe(false);
  });
});

describe('sanitizePhoneInput', () => {
  it('keeps digits and the punctuation a phone number is made of', () => {
    expect(sanitizePhoneInput('+91 82709-42966')).toBe('+91 82709-42966');
    expect(sanitizePhoneInput('(91) 8270942966')).toBe('(91) 8270942966');
  });

  it('drops letters as they are typed, not just at submit', () => {
    expect(sanitizePhoneInput('88777899798987979986869869')).toBe(
      '88777899798987979986869869',
    );
    expect(sanitizePhoneInput('call 8270942966 maybe')).toBe(' 8270942966 ');
    expect(sanitizePhoneInput('abc')).toBe('');
  });
});
