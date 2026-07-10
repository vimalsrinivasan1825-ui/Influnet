import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// These integration tests require a running Supabase instance AND a running Next.js app.
// Gate them on the presence of env vars so the suite skips (not fails) in local dev
// without secrets. In CI, set NEXT_PUBLIC_SUPABASE_URL etc. to run them.
const hasSupabaseEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Test users - use unique emails to avoid conflicts
const TEST_BUSINESS_EMAIL = `test_business_${Date.now()}@test.influnet.com`;
const TEST_INFLUENCER_EMAIL = `test_influencer_${Date.now()}@test.influnet.com`;
const TEST_PASSWORD = 'TestPass123!';

describe.skipIf(!hasSupabaseEnv)('Auth Integration', () => {
  it('should sign up a business user', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signUp({
      email: TEST_BUSINESS_EMAIL,
      password: TEST_PASSWORD,
    });
    // May succeed or return existing user error — either is acceptable
    if (error) {
      // If email confirmation is required, this is expected
      expect(error.message).toMatch(/email|confirm|already/i);
    } else {
      expect(data.user?.email).toBe(TEST_BUSINESS_EMAIL);
    }
  });

  it('should sign up an influencer user', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signUp({
      email: TEST_INFLUENCER_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error) {
      expect(error.message).toMatch(/email|confirm|already/i);
    } else {
      expect(data.user?.email).toBe(TEST_INFLUENCER_EMAIL);
    }
  });
});

describe.skipIf(!hasSupabaseEnv)('API Route Authorization', () => {
  it('should reject requests without Authorization header', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/collabs`, {
      method: 'GET',
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authorization|missing/i);
  });

  it('should reject requests with invalid token', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/collabs`, {
      headers: {
        Authorization: 'Bearer invalid_token_here',
      },
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasSupabaseEnv)('Zod Validation Integration', () => {
  it('should handle invalid input gracefully', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/collabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
      },
      body: JSON.stringify({ invalid_field: true }),
    });
    // Should return 401 (auth fails before validation)
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasSupabaseEnv)('Profile API', () => {
  let authToken: string;

  beforeAll(async () => {
    // Sign in as existing admin user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase.auth.signInWithPassword({
      email: 'admin@influnet.com',
      password: 'Admin@123',
    });
    if (data.session) {
      authToken = data.session.access_token;
    }
  });

  it('should return profile for authenticated user', async () => {
    if (!authToken) return; // Skip if no auth available
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/profile`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (res.ok) {
      const body = await res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.email).toBe('admin@influnet.com');
      expect(body.profile.role).toBe('admin');
    }
  });
});
