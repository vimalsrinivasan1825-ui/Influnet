import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  RegisterSchema,
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

describe('CollabRequestSchema', () => {
  it('accepts valid request with budget', () => {
    const result = CollabRequestSchema.safeParse({
      toUserId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Let\'s collaborate!',
      budget: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts request without optional fields', () => {
    const result = CollabRequestSchema.safeParse({
      toUserId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = CollabRequestSchema.safeParse({
      toUserId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative budget', () => {
    const result = CollabRequestSchema.safeParse({
      toUserId: '550e8400-e29b-41d4-a716-446655440000',
      budget: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectCreateSchema', () => {
  it('accepts valid project', () => {
    const result = ProjectCreateSchema.safeParse({
      counterpartyUserId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Instagram Campaign',
      budget: 10000,
      durationDays: 30,
      contentTypes: ['Reel', 'Story'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content types', () => {
    const result = ProjectCreateSchema.safeParse({
      counterpartyUserId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Campaign',
      contentTypes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('MessageSchema', () => {
  it('accepts valid message', () => {
    const result = MessageSchema.safeParse({ body: 'Hello, let\'s discuss the campaign!' });
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

describe('ProfileUpdateSchema', () => {
  it('accepts valid profile update', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'Updated Name',
      bio: 'Updated bio text',
      headline: 'Creator | Artist',
      availabilityStatus: 'open',
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
      availabilityStatus: 'super_busy',
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

describe('BusinessProfileUpdateSchema', () => {
  it('accepts valid business update', () => {
    const result = BusinessProfileUpdateSchema.safeParse({
      companyName: 'Updated Corp',
      industry: 'Finance',
      tagline: 'We build the future',
    });
    expect(result.success).toBe(true);
  });
});
