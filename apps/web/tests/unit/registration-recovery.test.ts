/**
 * Rebuilding a profile from auth metadata.
 *
 * With email confirmation on, `signUp` returns no session, so register_profile
 * cannot run at signup time. Web stashed the wizard answers in localStorage and
 * replayed them on first login — same-browser only. Confirm the email on your
 * phone, or sign up on mobile (which stashed nothing at all), and you ended up
 * signed in with an auth user and no profile row, in an app whose every screen
 * guards on `if (profile)`.
 *
 * The recovery path rebuilds from `user_metadata`, because both wizards already
 * pass their whole payload to signUp as `options.data`. That only works while
 * the metadata is a COMPLETE registration payload — if a wizard ever collects a
 * required field without sending it to signUp, recovery would produce a profile
 * missing it, and the failure would show up much later as a half-built account.
 *
 * So these tests pin the two wizard payloads verbatim and assert the shared
 * schema accepts them. They are the precondition the whole recovery path rests
 * on.
 */
import { describe, it, expect } from 'vitest';
import { RegisterProfileSchema } from '@influnet/core';

/**
 * Exactly the object apps/web/src/app/signup/influencer/page.tsx passes to
 * supabase.auth.signUp as options.data. Keep in step with it.
 */
const CREATOR_METADATA = {
  name: 'Asha Rao',
  role: 'influencer',
  username: 'asharao',
  email: 'asha@example.com',
  phone: '+919000000000',
  gender: 'female',
  city: 'Bengaluru',
  state: 'Karnataka',
  languages: ['English', 'Kannada'],
  niche: ['fashion', 'beauty'],
  bio: 'Fashion and lifestyle.',
  instagramHandle: 'asharao',
  youtubeHandle: 'asharao',
  twitterHandle: 'asharao',
  collabTypes: ['reel', 'story'],
  priceRange: '10000-25000',
  instagramFollowers: 42000,
};

/** Likewise for apps/web/src/app/signup/business/page.tsx. */
const BUSINESS_METADATA = {
  name: 'Ravi Kumar',
  role: 'business_owner',
  companyName: 'Kumar Foods',
  phone: '+919000000001',
  businessType: 'private_limited',
  industry: 'food',
  website: 'https://kumarfoods.example',
  city: 'Chennai',
  state: 'Tamil Nadu',
  registeredAddress: '12 Anna Salai',
  gstNumber: '33AABCU9603R1ZM',
  marketingBudget: '100000',
  location: 'Chennai, Tamil Nadu',
};

describe('registration recovery from auth metadata', () => {
  it('accepts the creator wizard payload as stored on the auth user', () => {
    const parsed = RegisterProfileSchema.safeParse(CREATOR_METADATA);
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
  });

  it('accepts the business wizard payload as stored on the auth user', () => {
    const parsed = RegisterProfileSchema.safeParse(BUSINESS_METADATA);
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
  });

  it('still refuses admin, however the payload arrived', () => {
    // Recovery reads metadata the user themselves supplied at signUp, so the
    // role guard has to hold on this path exactly as it does on the normal one.
    const parsed = RegisterProfileSchema.safeParse({
      ...CREATOR_METADATA,
      role: 'admin',
    });
    expect(parsed.success).toBe(false);
  });

  it('parses metadata that carries approvalStatus, which the route then strips', () => {
    // .passthrough() means the schema keeps unknown keys — approvalStatus is
    // removed by the route, not here. Asserting it SURVIVES parsing is the
    // point: if it were dropped silently, the route's strip would look
    // redundant and might get deleted.
    const parsed = RegisterProfileSchema.safeParse({
      ...BUSINESS_METADATA,
      approvalStatus: 'approved',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toHaveProperty('approvalStatus');
  });

  it('does not treat a phone verification token as inheritable', () => {
    // The token is optional in the schema, which is what lets recovery supply a
    // FRESH one from the body instead of a stale one from metadata. If it ever
    // became required, the recovery POST (which sends no token when OTP is off)
    // would 400 instead of succeeding.
    const parsed = RegisterProfileSchema.safeParse(CREATOR_METADATA);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.phoneVerificationToken).toBeUndefined();
  });

  it('rejects metadata with no role — the signal that there is nothing to rebuild', () => {
    const { role, ...noRole } = CREATOR_METADATA;
    expect(RegisterProfileSchema.safeParse(noRole).success).toBe(false);
  });
});
