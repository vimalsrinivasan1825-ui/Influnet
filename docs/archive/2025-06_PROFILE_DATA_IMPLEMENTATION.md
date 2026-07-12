# Profile Data Implementation — June 2025

Backend and onboarding fixes implemented **before** public profile UI. See also [USER_DATA_MODEL_AUDIT.md](./USER_DATA_MODEL_AUDIT.md).

---

## 1. Database migration plan

**Run in Supabase SQL Editor:**

```
supabase/migrations/021_profile_completion_and_business_public.sql
```

### What migration 021 adds

| Area | Changes |
|------|---------|
| **Influencer** | `headline`, `cover_image_url`, `availability_status`, `audience_demographics`, `past_collaborations` |
| **Business** | `username`, `username_changed_at`, `tagline`, `company_description`, `logo_url`, `cover_image_url`, `preferred_creator_niches`, `target_audience`, `past_campaigns` |
| **Storage** | `business-logos` bucket (public read, owner write) |
| **RPCs** | `is_username_globally_taken`, updated `register_profile`, privacy-safe `get_public_influencer`, new `get_public_business` |
| **Indexes** | Unique `business_profiles.username` (case-insensitive) |

### Prior migrations still required

`001`–`020` (especially `011` business extras, `013` avatars, `017` influencer username).

### Migration 022 — mobile OTP (2Factor)

**Run:** `supabase/migrations/022_phone_otp_verification.sql`

Adds `phone_verified`, `phone_verified_at`, `otp_verified_by` on `profiles`, OTP session/audit tables, and Edge Function RPCs.

Deploy and configure: [PHONE_OTP_SETUP.md](./PHONE_OTP_SETUP.md).

### Migration 023 — signup pricing tiers

**Run:** `supabase/migrations/023_register_profile_pricing.sql`

Derives `pricing_min` / `pricing_max` from `price_range` (`entry`, `standard`, `premium`, `pro`) during `register_profile`.

---

## Data model fixes (post-audit)

| Issue | Fix |
|-------|-----|
| Creator **email** leaked in Discover API | Removed from `listDiscoverInfluencers` |
| `resolveUser` null DB values clobbered auth metadata | `pickDbOrMeta` merge |
| Influencer `priceRange` saved as display label at signup | `influencer-signup-persist.js` maps tier ids |
| Business `marketingBudget` not captured (ellipsis mismatch) | `business-signup-persist.js` selector fix |
| Business collab prefs forced to `["influencers"]` | Removed false defaults in persist + settings |
| Business dashboard ignored `tagline` column | Uses `profile.tagline` first |
| Profile completion scores incomplete | Added languages, collab types, price range, business signup fields |
| Auth metadata stale after influencer profile save | Full field sync + `syncPhoneAuthMetadata` |
| `PATCH /api/business-profile/me` response shape | Returns `{ profile }` for settings client |

---

## 2. Updated register payloads

### Business (`POST /api/auth/register`)

Now persisted via `business-signup-persist.js` + `register_profile`:

```json
{
  "role": "business_owner",
  "companyName", "industry", "gstNumber", "website", "location",
  "collabPreferences",
  "businessType", "marketingBudget", "registeredAddress",
  "city", "state",
  "instagramHandle", "facebookHandle", "linkedinHandle",
  "businessUsername"
}
```

Auth metadata (`signupMeta`) mirrors the same business fields.

### Influencer

Unchanged core payload; `influencer-signup-persist.js` + `influencer-signup-username.js` continue to merge draft fields. Avatar uploads after register via `influencer-profile-photo.js`.

---

## 3. Updated `register_profile` RPC

Business branch now writes:

- `business_type`, `marketing_budget`, `registered_address`, `city`, `state`
- Social handles: `instagram_handle`, `facebook_handle`, `linkedin_handle`
- Optional `username` (validated globally unique)

Influencer branch uses `is_username_globally_taken` for cross-role URL collision prevention.

---

## 4. Public API changes

| Endpoint / RPC | Change |
|----------------|--------|
| `get_public_influencer(slug)` | **Removed `phone`**; added `city`, `state`, `headline`, `coverImageUrl`, `availabilityStatus`, `audienceDemographics`, `pastCollaborations` |
| `get_public_business(slug)` | **New** — approved businesses only; no email/phone/GST/address |
| `GET /api/public/influencer/:slug` | Strips `phone`, `email` if present |
| `GET /api/public/business/:slug` | **New** |
| `GET /api/business-profile/username/check` | Global username availability |
| `GET/PATCH /api/business-profile/me` | Full business profile CRUD |
| `POST /api/business-profile/logo` | Logo upload → `logo_url` |
| `GET/PATCH /api/profile/completion` | Post-signup completion state + saves |

### Public business response fields

`companyName`, `username`, `tagline`, `companyDescription`, `logoUrl`, `coverImageUrl`, `industry`, `businessType`, `website`, `location`, `city`, `state`, social handles, `marketingBudget`, `collabPreferences`, `preferredCreatorNiches`, `targetAudience`, `pastCampaigns`, `isVerified`

---

## 5. Profile completion workflow

### When it runs

After login on `/dashboard` or `/dashboard/influencer`, if `completion.postSignupComplete === false`.

### Influencer post-signup steps (not at registration)

1. Headline  
2. Availability status (`open` \| `limited` \| `paused`)  
3. Portfolio URLs  
4. Media kit URL  
5. Audience demographics (age ranges, top cities)

### Business post-signup steps

1. Business username (if missing)  
2. Tagline  
3. Company description  
4. Logo upload  
5. Preferred creator niches  
6. Target audience  

**UI:** `profile-completion-wizard.js` (modal). User can dismiss for 4 hours (“Later”).

### Signup vs post-signup

| Field | Influencer signup | Influencer post-signup |
|-------|-------------------|------------------------|
| Username, bio, niche, social | Signup | — |
| Headline, availability, audience | — | Wizard |
| Portfolio, media kit | — | Wizard |

| Field | Business signup | Business post-signup |
|-------|-----------------|----------------------|
| Company, industry, address, budget, social | Signup (now persisted) | — |
| Username, tagline, description, logo, niches, audience | Optional username at signup | Wizard |

---

## 6. Upload flow

| Asset | Script | API | Storage |
|-------|--------|-----|---------|
| Influencer avatar | `influencer-profile-photo.js` | `POST /api/influencer-profile/avatar` | `avatars` bucket |
| Business logo | `business-logo-upload.js` | `POST /api/business-profile/logo` | `business-logos` bucket |

Business logo at signup: file saved to `sessionStorage` → uploaded on first dashboard visit after approval.

---

## 7. Implementation order (completed)

1. Migration `021` (schema + RPCs + storage)  
2. `supabase-auth-bridge.js` v21 (register, profiles, public APIs, completion)  
3. `business-signup-persist.js` + `business-signup-username.js`  
4. `business-logo-upload.js`  
5. `profile-completion-wizard.js`  
6. `business-settings.js` → `PATCH /api/business-profile/me`  
7. **Not done:** Public profile **pages** (intentionally deferred)

---

## 8. Deploy checklist

1. Run `021_profile_completion_and_business_public.sql` in Supabase  
2. `firebase deploy --only hosting`  
3. Hard refresh  
4. Test business signup → verify `business_profiles` row has all fields  
5. Test `GET /api/public/business/{username}` for approved account  
6. Test influencer public API no longer returns `phone`

---

## 9. New files

| File | Purpose |
|------|---------|
| `supabase/migrations/021_profile_completion_and_business_public.sql` | DB + RPCs |
| `influnet/business-signup-persist.js` | Register payload merge |
| `influnet/business-signup-username.js` | Username field at signup |
| `influnet/business-logo-upload.js` | Logo upload pipeline |
| `influnet/profile-completion-wizard.js` | Post-login wizard |
| `influnet/profile-completion-wizard.css` | Wizard styles |
| `docs/PROFILE_DATA_IMPLEMENTATION.md` | This document |
