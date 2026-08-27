import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  RegisterSchema,
  RegisterProfileSchema,
  CollabRequestSchema,
  ProjectCreateSchema,
  MessageSchema,
  ProfileUpdateSchema,
  BusinessProfileUpdateSchema,
} from '@/lib/validators';

describe('LoginSchema', () => {
  it('accepts valid email and password', () => {
    const result = LoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = LoginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = LoginSchema.safeParse({
      email: 'test@example.com',
      password: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty email', () => {
    const result = LoginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  it('accepts valid influencer registration', () => {
    const result = RegisterSchema.safeParse({
      email: 'creator@test.com',
      password: 'password123',
      name: 'Test Creator',
      role: 'influencer',
      username: 'testcreator',
      niche: ['Fashion'],
      bio: 'A test creator',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid business registration', () => {
    const result = RegisterSchema.safeParse({
      email: 'business@test.com',
      password: 'password123',
      name: 'Test Business',
      role: 'business_owner',
      companyName: 'Test Corp',
      industry: 'Tech',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = RegisterSchema.safeParse({
      email: 'test@test.com',
      password: 'password123',
      name: 'Test',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = RegisterSchema.safeParse({
      email: 'test@test.com',
      password: 'password123',
      name: '',
      role: 'influencer',
    });
    expect(result.success).toBe(false);
  });
});

describe('RegisterProfileSchema', () => {
  it('accepts valid influencer profile payload (no email/password)', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Test Creator',
      role: 'influencer',
      username: 'testcreator',
      niche: ['Fashion'],
      bio: 'A test creator',
      instagramHandle: '@testcreator', // influencers must supply ≥1 social handle
    });
    expect(result.success).toBe(true);
  });

  it('rejects an influencer with no social handle', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Handleless Creator',
      role: 'influencer',
      username: 'nohandle',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid business profile payload (no email/password)', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Test Business',
      role: 'business_owner',
      companyName: 'Test Corp',
      industry: 'Tech',
    });
    expect(result.success).toBe(true);
  });

  it('rejects role=admin — privilege escalation blocked', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Hacker',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = RegisterProfileSchema.safeParse({
      role: 'influencer',
    });
    expect(result.success).toBe(false);
  });

  it('accepts phoneVerificationToken as null (OTP feature disabled) or a uuid', () => {
    const base = {
      name: 'Creator',
      role: 'influencer' as const,
      instagramHandle: '@creator',
    };
    // OTP off: the wizards have no token and send null.
    expect(RegisterProfileSchema.safeParse({ ...base, phoneVerificationToken: null }).success).toBe(true);
    // OTP off, field omitted entirely.
    expect(RegisterProfileSchema.safeParse(base).success).toBe(true);
    // OTP on: a real minted token.
    expect(RegisterProfileSchema.safeParse({
      ...base, phoneVerificationToken: '00000000-0000-0000-0000-000000000000',
    }).success).toBe(true);
    // A non-uuid string is still rejected.
    expect(RegisterProfileSchema.safeParse({ ...base, phoneVerificationToken: 'nope' }).success).toBe(false);
  });

  it('passes through unknown fields (preserves RPC data)', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Creator',
      role: 'influencer',
      instagramHandle: '@creator', // influencers must supply ≥1 social handle
      someUnknownRpcField: 'value',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).someUnknownRpcField).toBe('value');
    }
  });

  // The reported bug: a signup form typed into with garbage — a 26-digit
  // paste, letters mixed in — reached THIS schema, the one thing actually
  // enforced server-side on registration, and it accepted anything at all
  // (`phone: z.string().optional()`, no format check). No client-side keyboard
  // restriction mattered because the enforcement point took whatever arrived.
  it('rejects a phone number that is obviously not one', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Creator',
      role: 'influencer',
      instagramHandle: '@creator',
      phone: '88777899798987979986869869', // the exact string from the report
    });
    expect(result.success).toBe(false);
  });

  it('rejects letters in the phone field', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Creator',
      role: 'influencer',
      instagramHandle: '@creator',
      phone: 'not a phone number',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a real number and normalises it to E.164', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Creator',
      role: 'influencer',
      instagramHandle: '@creator',
      phone: '8270942966',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('+918270942966');
    }
  });

  it('leaves phone out entirely — not every signup collects one', () => {
    const result = RegisterProfileSchema.safeParse({
      name: 'Creator',
      role: 'influencer',
      instagramHandle: '@creator',
    });
    expect(result.success).toBe(true);
  });
});

describe('PhoneSchema · via RegisterProfileSchema', () => {
  const base = { name: 'Creator', role: 'influencer' as const, instagramHandle: '@creator' };
  const phoneResult = (phone: string) => RegisterProfileSchema.safeParse({ ...base, phone }).success;

  it('accepts every shape the two clients actually write', () => {
    for (const phone of [
      '8270942966', // web signup form
      '+91 8270942966', // mobile signup
      '+918270942966', // older rows
      '91 82709 42966',
      '08270942966', // STD-dialled
      '+91-82709-42966',
    ]) {
      expect(phoneResult(phone), phone).toBe(true);
    }
  });

  it('rejects what the screenshot typed', () => {
    // 26 digits — well past any real phone number, and the field's only
    // client-side gate before this fix was "at least 10 digits".
    expect(phoneResult('88777899798987979986869869')).toBe(false);
  });

  it('rejects wrong-length and wrong-prefix numbers', () => {
    expect(phoneResult('123456789')).toBe(false); // 9 digits
    expect(phoneResult('12345678901')).toBe(false); // 11 digits, not 0-prefixed
    expect(phoneResult('1234567890')).toBe(false); // 10 digits, doesn't start 6-9
  });

  it('rejects text', () => {
    expect(phoneResult('not a number')).toBe(false);
    expect(phoneResult('call me maybe')).toBe(false);
  });
});

// Schema uses snake_case: to_user_id, project_title, project_description, message, budget
describe('CollabRequestSchema', () => {
  it('accepts valid request with budget', () => {
    const result = CollabRequestSchema.safeParse({
      to_user_id: '550e8400-e29b-41d4-a716-446655440000',
      message: "Let's collaborate!",
      budget: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts request without optional fields', () => {
    const result = CollabRequestSchema.safeParse({
      to_user_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = CollabRequestSchema.safeParse({
      to_user_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative budget', () => {
    const result = CollabRequestSchema.safeParse({
      to_user_id: '550e8400-e29b-41d4-a716-446655440000',
      budget: -100,
    });
    expect(result.success).toBe(false);
  });
});

// Schema uses snake_case: counterparty_user_id, content_types, duration_days
describe('ProjectCreateSchema', () => {
  it('accepts valid project', () => {
    const result = ProjectCreateSchema.safeParse({
      counterparty_user_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Instagram Campaign',
      budget: 10000,
      duration_days: 30,
      content_types: ['Reel', 'Story'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content types', () => {
    const result = ProjectCreateSchema.safeParse({
      counterparty_user_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Campaign',
      content_types: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('MessageSchema', () => {
  it('accepts valid message', () => {
    const result = MessageSchema.safeParse({ body: "Hello, let's discuss the campaign!" });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = MessageSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects too long message', () => {
    const result = MessageSchema.safeParse({ body: 'a'.repeat(5001) });
    expect(result.success).toBe(false);
  });
});

// Schema uses snake_case: availability_status (not availabilityStatus)
describe('ProfileUpdateSchema', () => {
  it('accepts valid profile update', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'Updated Name',
      bio: 'Updated bio text',
      headline: 'Creator | Artist',
      availability_status: 'open',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial update', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'Just Name',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid availability status', () => {
    const result = ProfileUpdateSchema.safeParse({
      availability_status: 'super_busy',
    });
    expect(result.success).toBe(false);
  });

  it('accepts media-kit fields (pricing, past collaborations, audience)', () => {
    const result = ProfileUpdateSchema.safeParse({
      pricing_min: 5000,
      pricing_max: 25000,
      past_collaborations: ['Mamaearth', 'Boat'],
      audience_demographics: {
        locations: [{ label: 'India', pct: 72 }],
        age: [{ label: '25-34', pct: 41 }],
        gender: [{ label: 'Female', pct: 60 }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an audience slice pct over 100', () => {
    const result = ProfileUpdateSchema.safeParse({
      audience_demographics: { locations: [{ label: 'India', pct: 140 }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects too long bio', () => {
    const result = ProfileUpdateSchema.safeParse({
      bio: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// Schema uses snake_case: company_name (not companyName)
describe('BusinessProfileUpdateSchema', () => {
  it('accepts valid business update', () => {
    const result = BusinessProfileUpdateSchema.safeParse({
      company_name: 'Updated Corp',
      industry: 'Finance',
      tagline: 'We build the future',
    });
    expect(result.success).toBe(true);
  });
});
