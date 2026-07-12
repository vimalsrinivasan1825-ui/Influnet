# User Data Model Audit — Pre–Public Profile Design

**Date:** June 2025  
**Scope:** Registration, onboarding, profile setup, and edit flows for Influencers and Business Owners.  
**Goal:** Identify existing data, gaps, and where new fields should be collected — **not** profile page UI design.

**Sources audited:**
- Supabase migrations `001`–`020`
- `influnet/supabase-auth-bridge.js` (API, `register_profile`, `get_public_influencer`, profile completion)
- React bundle `influnet/assets/index-Bqfxp3sU.js` (signup wizards)
- Overlay scripts: `influencer-signup-persist.js`, `influencer-signup-username.js`, `influencer-profile-full-edit.js`, `business-settings.js`, `business-signup-review.js`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Collection Phases](#collection-phases)
3. [Database Schema](#database-schema)
4. [Influencer Audit](#influencer-audit)
5. [Business Owner Audit](#business-owner-audit)
6. [Data Pipeline Gaps](#data-pipeline-gaps)
7. [Improved Onboarding Flows](#improved-onboarding--profile-completion-flows)
8. [Final Database Field Checklist](#final-database-field-checklist)
9. [Next Steps Before Profile UI](#next-steps-before-profile-ui)

---

## Executive Summary

| Area | Status |
|------|--------|
| **Influencer data model** | Rich — most public-profile fields exist in `influencer_profiles` and are exposed via `get_public_influencer` |
| **Influencer signup → DB** | Partial — `influencer-signup-persist.js` patches gaps; avatar and follower counts often missing at signup |
| **Business data model** | Columns exist (migration `011`) but **signup register payload omits most step 2–4 fields** |
| **Business public profile** | **Does not exist** — no slug, no logo storage, no `get_public_business` RPC |
| **Post-login onboarding** | **None** — 4-step signup wizards *are* onboarding; users go straight to dashboard |
| **Profile completion** | Influencer only (`computeProfileCompletion` in auth bridge); business has no score |

There is **no separate `/onboarding` route**. Influencers land on `/dashboard/influencer` after signup. Businesses submit for admin review (`approval_status: pending_review`), are signed out, and sign in later after approval.

---

## Collection Phases

### 1. Registration (account creation)

| Step | Influencer | Business Owner |
|------|------------|----------------|
| Auth | Email + password via Supabase (`POST /api/auth/register`) | Same |
| OTP | Email OTP flow exists (`send-otp` / `verify-otp`); optional UI on business signup | Same |
| Role | `influencer` | `business_owner` |
| DB write | `register_profile` RPC + `auth.updateUser({ data: signupMeta })` | Same + `approval_status: pending_review`, session cleared |

**Shared auth fields:** `email`, `password`, `role`

---

### 2. Onboarding (4-step signup wizards)

Routes: `/signup/influencer`, `/signup/business`

#### Influencer — 4 steps

| Step | Fields collected (UI) | Sent on `register` (React default) | Persisted to DB at signup |
|------|----------------------|--------------------------------------|---------------------------|
| **1 — Account** | First name, last name, email, phone, password | `name`, `email`, `phone`, `password` | `profiles.name`, `profiles.phone` |
| **2 — Profile** | Avatar (file preview only), gender, city, state, languages | — | — (avatar not uploaded) |
| **3 — Creator** | Primary/secondary niche, bio, IG/FB/YT/LinkedIn + extra platforms | `bio`, `niche`, `location`, `instagramHandle`, `youtubeHandle`, `twitterHandle` | Partial via `register_profile` |
| **4 — Collaboration** | Collab types (reel/story/post/yt/event), price range tier | — | — |

**Overlay patches:**
- `influencer-signup-username.js` — injects mandatory **username** into register body
- `influencer-signup-persist.js` — merges session draft into register: `gender`, `city`, `state`, `languages`, `collabTypes`, `priceRange`, `facebookHandle`, `linkedinHandle`, `tiktokHandle`, `twitterHandle`

**React default register payload (influencer):**
```json
{
  "email", "password", "name", "phone", "role": "influencer",
  "bio", "location", "niche": ["primary", "secondary"],
  "instagramHandle", "youtubeHandle", "twitterHandle"
}
```

#### Business — 4 steps

| Step | Fields collected (UI) | Sent on `register` | Persisted to DB at signup |
|------|----------------------|-------------------|---------------------------|
| **1 — Account** | Full name, business name, work email, password, mobile (+ OTP UI) | `name`, `email`, `password`, `phone`, `companyName` | `profiles` + partial `business_profiles` |
| **2 — Company** | Business type, industry, website, Instagram, Facebook, LinkedIn | `industry`, `website` | `industry`, `website` only |
| **3 — Verification** | GST, city, state, registered address, company logo (preview only) | `gstNumber`, `location` (`city, state`) | `gst_number`, `profiles.location` |
| **4 — Intent** | Monthly marketing budget, “looking for” collab preferences | `collabPreferences` | `collab_preferences` |

**React default register payload (business):**
```json
{
  "email", "password", "name", "phone", "role": "business_owner",
  "companyName", "industry", "gstNumber", "website",
  "location": "city, state", "collabPreferences"
}
```

**Critical gap:** `businessType`, `marketingBudget`, `registeredAddress`, `city`, `state` (as columns), and social handles are **collected in UI but NOT sent on register**. They only persist if the user later visits **Settings** (`business-settings.js` → `PATCH /api/auth/me`).

---

### 3. Profile setup (post-login, first-time)

| Role | Current behavior |
|------|------------------|
| **Influencer** | Redirect to `/dashboard/influencer`; profile completion widget on dashboard (`computeProfileCompletion`); avatar via `POST /api/influencer-profile/avatar` |
| **Business** | Pending review blocks dashboard; after approval, dashboard loads with tagline **synthesized** from `industry` (no dedicated setup wizard) |

No guided “complete your profile” wizard exists for either role after first login.

---

### 4. Edit profile

| Role | UI surface | API endpoint |
|------|-----------|--------------|
| **Influencer** | `influencer-profile-full-edit.js` (full signup parity + portfolio, media kit, username) | `PATCH /api/influencer-profile/me` |
| **Influencer** | React legacy edit (partial) | `PATCH /api/auth/me` (`updateCurrentUserProfile` — thinner path) |
| **Business** | `business-settings.js` | `PATCH /api/auth/me` |
| **Both** | Email/password change | `POST /api/auth/update-email`, `POST /api/auth/change-password` |

#### Influencer edit profile fields (`influencer-profile-full-edit.js`)

- Contact: phone (name/email read-only)
- Username (30-day change cooldown)
- Profile details: gender, city, state, languages
- Creator & social: primary/secondary niche, bio, IG/FB/YT/LinkedIn/TikTok handles + follower counts, extra platforms (TikTok, Twitter/X, Snapchat, Pinterest, website)
- Collaboration: collab types, price range tier
- Portfolio & media kit: `mediaKitUrl`, portfolio URLs (one per line)

**Not in edit UI but in API/DB:** `engagementRate`, explicit `pricingMin`/`pricingMax` (derived from price tier on save), `avatarUrl` (separate avatar upload endpoint)

#### Business edit profile fields (`business-settings.js`)

- Account: full name, company name, phone
- Business: business type, industry, website, Instagram, Facebook, LinkedIn
- Verification & address: GST, city, state, registered address
- Collaboration: monthly marketing budget (collab prefs hardcoded to `["influencers"]` on save)

---

## Database Schema

### `profiles` (shared, 1 row per `auth.users`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | FK → `auth.users` |
| `role` | `user_role` enum | `business_owner` \| `influencer` |
| `email` | TEXT | |
| `name` | TEXT | |
| `phone` | TEXT | |
| `location` | TEXT | Composite string, often `"city, state"` |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `influencer_profiles` (1 row per influencer)

| Column | Type | In signup UI | In edit UI | In `get_public_influencer` |
|--------|------|-------------|-----------|---------------------------|
| `user_id` | UUID PK | — | — | — |
| `username` | TEXT UNIQUE | Yes (injected) | Yes | Yes |
| `profile_slug` | TEXT | Legacy | — | Fallback only |
| `username_changed_at` | TIMESTAMPTZ | — | On change | No |
| `bio` | TEXT | Step 3 | Yes | Yes |
| `niche` | JSONB | Step 3 | Yes | Yes |
| `avatar_url` | TEXT | Step 2 preview | Upload API | Yes |
| `gender` | TEXT | Step 2 | Yes | **No** |
| `city` | TEXT | Step 2 | Yes | **No** (only `profiles.location`) |
| `state` | TEXT | Step 2 | Yes | **No** |
| `languages` | JSONB | Step 2 | Yes | Yes |
| `collab_types` | JSONB | Step 4 | Yes | Yes |
| `price_range` | TEXT | Step 4 | Yes | Yes |
| `pricing_min` | NUMERIC | Derived | Derived | Yes |
| `pricing_max` | NUMERIC | Derived | Derived | Yes |
| `instagram_handle` | TEXT | Step 3 | Yes | Yes |
| `facebook_handle` | TEXT | Step 3 | Yes | Yes |
| `youtube_handle` | TEXT | Step 3 | Yes | Yes |
| `twitter_handle` | TEXT | Step 3 (extra) | Yes | Yes |
| `linkedin_handle` | TEXT | Step 3 | Yes | Yes |
| `tiktok_handle` | TEXT | Step 3 (extra) | Yes | Yes |
| `extra_social_links` | JSONB | Edit | Yes | **No** |
| `instagram_followers` | INTEGER | Edit only | Yes | Yes |
| `facebook_followers` | INTEGER | Edit only | Yes | Yes |
| `youtube_subscribers` | INTEGER | Edit only | Yes | Yes |
| `tiktok_followers` | INTEGER | Edit only | Yes | Yes |
| `engagement_rate` | NUMERIC(5,2) | **No UI** | API only | Yes |
| `media_kit_url` | TEXT | Edit | Yes | Yes |
| `portfolio` | JSONB | Edit | Yes | Yes |
| `is_verified` | BOOLEAN | Platform/admin | — | Yes |

### `business_profiles` (1 row per business)

| Column | Type | In signup UI | In register payload | In settings |
|--------|------|-------------|---------------------|-------------|
| `user_id` | UUID PK | — | — | — |
| `company_name` | TEXT | Step 1 | Yes | Yes |
| `industry` | TEXT | Step 2 | Yes | Yes |
| `business_type` | TEXT | Step 2 | **No** | Yes |
| `gst_number` | TEXT | Step 3 | Yes | Yes |
| `website` | TEXT | Step 2 | Yes | Yes |
| `marketing_budget` | TEXT | Step 4 | **No** | Yes |
| `registered_address` | TEXT | Step 3 | **No** | Yes |
| `city` | TEXT | Step 3 | Via `location` only | Yes |
| `state` | TEXT | Step 3 | Via `location` only | Yes |
| `instagram_handle` | TEXT | Step 2 | **No** | Yes |
| `facebook_handle` | TEXT | Step 2 | **No** | Yes |
| `linkedin_handle` | TEXT | Step 2 | **No** | Yes |
| `collab_preferences` | JSONB | Step 4 | Yes | Yes (overwritten) |
| `approval_status` | TEXT | System | Yes (`pending_review`) | Read-only |

**Missing for business public profiles:** `slug`, `tagline`, `company_description`, `logo_url`, `cover_image_url`, `target_audience`, `preferred_creator_niches`, `past_campaigns`, `get_public_business` RPC.

### Related tables (not profile fields but used by discovery/trust)

| Table | Purpose |
|-------|---------|
| `profile_views` / `creator_profile_views` | Business views of creator profiles |
| `profile_link_clicks` | Clicks on public profile links |
| `influencer_shortlists` | Business saved creators |
| `avatars` storage bucket | Influencer profile photos (migration `013`) |

---

## Influencer Audit

### Existing Fields

| Field | Type | Where collected | Storage | Public today |
|-------|------|-----------------|---------|--------------|
| Email | string | Signup step 1 | `profiles`, auth | **Private** |
| Password | string | Signup step 1 | auth | **Private** |
| Name (first + last) | string | Signup step 1 | `profiles.name` | Public (`name`) |
| Phone | string | Signup 1, edit | `profiles.phone` | **Exposed in RPC** ⚠️ should be private |
| Username | string | Signup (injected), edit | `influencer_profiles.username` | Public |
| Gender | text | Signup 2, edit | `influencer_profiles.gender` | Private |
| City | string | Signup 2, edit | `influencer_profiles.city` | Via `location` only |
| State | string | Signup 2, edit | `influencer_profiles.state` | Via `location` only |
| Location (composite) | string | Derived | `profiles.location` | Public |
| Languages | string[] | Signup 2, edit | `influencer_profiles.languages` | Public |
| Primary / secondary niche | string[] | Signup 3, edit | `influencer_profiles.niche` | Public |
| Bio | text | Signup 3, edit | `influencer_profiles.bio` | Public |
| Instagram handle | string | Signup 3, edit | `instagram_handle` | Public |
| Facebook handle | string | Signup 3, edit | `facebook_handle` | Public |
| YouTube handle | string | Signup 3, edit | `youtube_handle` | Public |
| LinkedIn handle | string | Signup 3, edit | `linkedin_handle` | Public |
| TikTok handle | string | Signup 3 (extra), edit | `tiktok_handle` | Public |
| Twitter / X handle | string | Signup 3 (extra), edit | `twitter_handle` | Public |
| Extra platforms | JSON | Edit only | `extra_social_links` | Private |
| Collab types | string[] | Signup 4, edit | `collab_types` | Public |
| Price range tier | enum | Signup 4, edit | `price_range` | Public |
| Pricing min / max | numeric | Derived from tier | `pricing_min`, `pricing_max` | Public |
| Avatar | URL | Signup 2 preview; upload API | `avatar_url` + storage | Public |
| IG followers | integer | Edit only | `instagram_followers` | Public |
| FB followers | integer | Edit only | `facebook_followers` | Public |
| YT subscribers | integer | Edit only | `youtube_subscribers` | Public |
| TikTok followers | integer | Edit only | `tiktok_followers` | Public |
| Engagement rate | numeric | API only (no UI) | `engagement_rate` | Public |
| Media kit URL | string | Edit | `media_kit_url` | Public |
| Portfolio links | JSON `{url}[]` | Edit | `portfolio` | Public |
| Is verified | boolean | Platform/admin | `is_verified` | Public |

**Profile completion checks** (`computeProfileCompletion`): username, profile photo, bio, location, categories (niche), social links, portfolio, contact (phone), media kit.

**Discover API** (`GET /api/discover/influencers`): name, bio, niche, username, location, social handles, follower counts, engagement rate, verified flag.

---

### Missing Fields (Influencer)

Recommendations support: public profiles, collaboration matching, creator discovery, trust & verification, portfolio showcase, collaboration management.

| Field Name | Field Type | Required / Optional | Public / Private | Reason it is needed |
|------------|-----------|---------------------|------------------|---------------------|
| `headline` | string (≤120 chars) | Optional | **Public** | Short hook for discovery cards and search; bio is too long |
| `cover_image_url` | string (URL) | Optional | **Public** | Visual identity on public profile beyond avatar |
| `audience_demographics` | JSON `{ageRanges[], genderSplit{}, topCities[]}` | Optional | **Public** | Creator discovery and campaign matching by audience fit |
| `content_formats` | string[] | Optional | **Public** | Finer matching than `collab_types` (unboxing, tutorials, reviews) |
| `availability_status` | enum: `open` \| `limited` \| `paused` | Optional | **Public** | Businesses filter creators currently open for work |
| `typical_turnaround_days` | integer | Optional | **Public** | Collaboration management — set delivery expectations |
| `brand_exclusions` | string[] | Optional | **Private** | Matching safety (alcohol, gambling, competitors) |
| `past_collaborations` | JSON `[{brandName, campaignType, year, resultUrl?, metric?}]` | Optional | **Public** | Structured portfolio beyond raw URLs; builds trust |
| `social_verified` | JSON per platform `{platform, verifiedAt}` | Optional | **Public** | Trust — distinguish self-reported vs platform-connected stats |
| `engagement_rate` (UI) | numeric | Optional | **Public** | Column exists but no collection UI; needed for discovery sort/filter |
| `open_to_gifted` | boolean | Optional | **Public** | Collaboration matching on compensation type |
| `open_to_paid` | boolean | Optional | **Public** | Collaboration matching on compensation type |
| `minimum_campaign_budget` | numeric (INR) | Optional | **Public** | Reduces mismatched outreach vs coarse price tier |
| `profile_visibility` | enum: `public` \| `unlisted` \| `private` | Optional | **Private** | Control discoverability without deleting account |
| Remove `phone` from public RPC | — | — | **Private** | Privacy fix — `get_public_influencer` currently returns phone |

**Not recommended for v1:** OAuth social sync, automated third-party audience APIs (high cost; manual fields sufficient).

---

## Business Owner Audit

### Existing Fields

| Field | Type | Where collected | Storage | Public today |
|-------|------|-----------------|---------|--------------|
| Email | string | Signup 1 | `profiles`, auth | **Private** |
| Password | string | Signup 1 | auth | **Private** |
| Full name | string | Signup 1 | `profiles.name` | Private (contact person) |
| Company name | string | Signup 1 | `business_profiles.company_name` | Dashboard only |
| Phone | string | Signup 1, settings | `profiles.phone` | **Private** |
| Business type | string | Signup 2, settings | `business_profiles.business_type` | **Often empty** (not in register payload) |
| Industry | string | Signup 2, settings | `business_profiles.industry` | Dashboard tagline source |
| Website | string | Signup 2, settings | `business_profiles.website` | Dashboard |
| Instagram handle | string | Signup 2, settings | `instagram_handle` | **Often empty** at signup |
| Facebook handle | string | Signup 2, settings | `facebook_handle` | **Often empty** at signup |
| LinkedIn handle | string | Signup 2, settings | `linkedin_handle` | **Often empty** at signup |
| GST number | string | Signup 3, settings | `gst_number` | **Private** (verification) |
| City | string | Signup 3, settings | `city` | Partial via location |
| State | string | Signup 3, settings | `state` | Partial via location |
| Registered address | text | Signup 3, settings | `registered_address` | **Private** |
| Company logo | file | Signup 3 preview | **Not stored** | None |
| Marketing budget range | string | Signup 4, settings | `marketing_budget` | **Often empty** at signup |
| Collab preferences | string[] | Signup 4 | `collab_preferences` | Dashboard |
| Approval status | enum | System | `approval_status` | Shown as `isVerified` when `approved` |

**Business dashboard** synthesizes `tagline` from `industry` — there is **no `bio` or `tagline` column** on `business_profiles`.

---

### Missing Fields (Business Owner)

| Field Name | Field Type | Required / Optional | Public / Private | Reason it is needed |
|------------|-----------|---------------------|------------------|---------------------|
| `slug` / `business_username` | string (unique) | **Required** for public page | **Public** | Business discovery URLs — no identifier exists today |
| `tagline` | string (≤160 chars) | Optional | **Public** | Public profile hero text; today synthesized from industry |
| `company_description` | text | Optional | **Public** | “About this brand” section on public profile |
| `logo_url` | string (URL) | Optional | **Public** | Signup collects logo preview but never uploads; needed for discovery cards |
| `cover_image_url` | string (URL) | Optional | **Public** | Public profile visual layer |
| `company_size` | enum (startup/SME/enterprise/etc.) | Optional | **Public** | Business discovery — match to creator tier |
| `target_audience` | JSON `{ageRanges[], genders[], regions[], interests[]}` | Optional | **Public** | Collaboration matching — brands state who they reach |
| `campaign_types_sought` | string[] | Optional | **Public** | Replace hardcoded “Looking for: Influencers”; powers matching |
| `preferred_creator_niches` | string[] | Optional | **Public** | Creator discovery alignment |
| `preferred_budget_per_creator` | string or numeric range | Optional | **Public** | Finer than monthly marketing budget |
| `past_campaigns` | JSON `[{title, year, creatorsCount, outcomeUrl?}]` | Optional | **Public** | Portfolio showcase for businesses |
| `twitter_handle` | string | Optional | **Public** | Business discovery completeness |
| `youtube_handle` | string | Optional | **Public** | Business discovery completeness |
| `primary_contact_name` | string | Optional | **Private** | Collaboration management (vs legal company name) |
| `primary_contact_role` | string | Optional | **Private** | Trust in B2B outreach (e.g. “Marketing Manager”) |
| `verification_tier` | enum: `pending` \| `gst_verified` \| `trusted` | System | **Public badge** | Trust beyond binary `approval_status` |
| `profile_visibility` | enum: `public` \| `unlisted` \| `private` | Optional | **Private** | Control business public listing |
| `get_public_business(slug)` RPC | infrastructure | — | — | No public read path exists for businesses |

**Pipeline fix (not new fields):** persist `businessType`, `marketingBudget`, `registeredAddress`, `city`, `state`, and social handles **at signup** — columns already exist (migration `011`).

---

## Data Pipeline Gaps

### Influencer flow

```
4-step signup UI
    ├── React register (minimal payload)
    ├── influencer-signup-persist.js (merges draft)
    ├── influencer-signup-username.js (injects username)
    └── register_profile RPC → influencer_profiles + profiles
         └── auth.updateUser(metadata mirror)

Gaps:
  • Avatar: preview at signup, upload only via POST /api/influencer-profile/avatar later
  • Follower counts: not collected at signup, only in full edit
  • engagement_rate: DB + API exist, no UI
  • phone: leaked on public RPC
```

### Business flow

```
4-step signup UI
    └── React register (subset of collected fields)
         ├── register_profile RPC → partial business_profiles
         └── auth.updateUser(metadata may not include unsent fields)

Gaps:
  • businessType, marketingBudget, registeredAddress, city, state, social handles NOT in register body
  • Company logo: preview only, never uploaded
  • collabPreferences from signup step 4 may be overwritten to ["influencers"] on settings save
  • No public business API or slug
```

### `register_profile` vs latest migration

Latest `register_profile` is in migration `017_influencer_username.sql`. Business branch does not include `business_type`, `marketing_budget`, `registered_address`, `city`, `state`, or social handles — even though columns exist from migration `011`.

### Auth metadata vs Postgres

`completeRegistration` calls `auth.updateUser({ data: signupMeta })` with `{ email, password, ...meta }` from the request body. Fields **not in the register body** are never written to metadata or DB at signup.

---

## Improved Onboarding / Profile Completion Flows

### Influencers (proposed)

| Phase | When | What to collect | Required to proceed |
|-------|------|-----------------|---------------------|
| **A. Account** | Signup step 1 | Email, password, first/last name, phone | All |
| **B. Identity** | Signup step 2 | **Username** (required), avatar upload to storage, city + state, languages | Username + location |
| **C. Creator positioning** | Signup step 3 | Primary niche, bio (≥50 chars), ≥1 social handle + follower count on primary platform | All |
| **D. Collaboration** | Signup step 4 | ≥1 collab type, price tier | All |
| **E. Post-login boost** (new) | First dashboard visit if completion < 70% | Engagement rate (optional), media kit OR ≥2 portfolio links, availability status | Optional; “Boost discovery” CTA |
| **F. Ongoing** | Edit Profile | All current `influencer-profile-full-edit.js` fields | — |

**Extend `computeProfileCompletion`** to include: languages, collab types, price range; optionally engagement rate and availability.

### Business owners (proposed)

| Phase | When | What to collect | Required to proceed |
|-------|------|-----------------|---------------------|
| **A. Account** | Signup step 1 | Full name, company name, work email, password, phone | All |
| **B. Company** | Signup step 2 | Business type, industry, website (optional), ≥1 social link | Type + industry |
| **C. Verification** | Signup step 3 | City, state, registered address, GST (optional), **logo upload to storage** | City, state, address |
| **D. Collaboration intent** | Signup step 4 | Marketing budget, campaign types sought, preferred creator niches | Budget + ≥1 campaign type |
| **E. Admin review** | Post-register | `approval_status` workflow | Blocks login until approved |
| **F. Post-approval setup** (new) | First dashboard visit | Company description, tagline, business slug, target audience | Slug + tagline for public listing |
| **G. Ongoing** | Settings | All `business-settings.js` fields; preserve signup collab prefs | — |

**Prerequisite:** extend register payload + `register_profile` to persist all steps B–D fields atomically at signup.

---

## Final Database Field Checklist

Everything required to build **complete public profiles** backed by real user data.

### Influencer public profile

| # | Table.column | Collect in | Required for complete public profile |
|---|--------------|------------|--------------------------------------|
| 1 | `profiles.name` | Signup 1 | ✅ Yes |
| 2 | `influencer_profiles.username` | Signup 2 | ✅ Yes |
| 3 | `influencer_profiles.avatar_url` | Signup 2 / avatar API | ✅ Yes |
| 4 | `profiles.location` or `city` + `state` | Signup 2 | ✅ Yes |
| 5 | `influencer_profiles.bio` | Signup 3 | ✅ Yes |
| 6 | `influencer_profiles.niche` | Signup 3 | ✅ Yes (≥1) |
| 7 | `influencer_profiles.*_handle` (≥1 platform) | Signup 3 | ✅ Yes |
| 8 | `*_followers` / `youtube_subscribers` | Signup 3 or edit | ✅ Yes for primary platform |
| 9 | `influencer_profiles.languages` | Signup 2 | Recommended |
| 10 | `influencer_profiles.collab_types` | Signup 4 | ✅ Yes |
| 11 | `influencer_profiles.price_range` | Signup 4 | ✅ Yes |
| 12 | `portfolio` OR `media_kit_url` | Edit | One of |
| 13 | `engagement_rate` | New edit field | Recommended |
| 14 | `is_verified` | Platform | System |
| 15 | **NEW** `headline` | Post-login / edit | Recommended |
| 16 | **NEW** `cover_image_url` | Edit | Optional |
| 17 | **NEW** `audience_demographics` | Post-login wizard | Optional |
| 18 | **NEW** `availability_status` | Post-login wizard | Recommended |
| 19 | **NEW** `past_collaborations` | Edit | Optional |
| 20 | `profiles.phone`, `profiles.email` | Signup | 🔒 **Private only** |

**RPC changes for `get_public_influencer`:**
- Add: `city`, `state`, `headline`, `cover_image_url`, `audience_demographics`, `availability_status`, `past_collaborations`
- Remove: `phone` from public response
- Consider: `gender` as private (omit from public)

### Business public profile

| # | Table.column | Collect in | Required for complete public profile |
|---|--------------|------------|--------------------------------------|
| 1 | `business_profiles.company_name` | Signup 1 | ✅ Yes |
| 2 | **NEW** `slug` | Post-approval setup | ✅ Yes |
| 3 | **NEW** `tagline` | Post-approval setup | ✅ Yes |
| 4 | **NEW** `company_description` | Post-approval setup | ✅ Yes |
| 5 | **NEW** `logo_url` | Signup 3 upload + storage | ✅ Yes |
| 6 | `business_profiles.industry` | Signup 2 | ✅ Yes |
| 7 | `business_profiles.business_type` | Signup 2 | Recommended |
| 8 | `business_profiles.website` | Signup 2 | Optional |
| 9 | `*_handle` (≥1 social) | Signup 2 | Recommended |
| 10 | `city`, `state` | Signup 3 | ✅ Yes |
| 11 | `marketing_budget` | Signup 4 | Recommended |
| 12 | `collab_preferences` | Signup 4 | ✅ Yes |
| 13 | **NEW** `preferred_creator_niches` | Signup 4 / edit | Recommended |
| 14 | **NEW** `target_audience` | Post-approval setup | Recommended |
| 15 | **NEW** `past_campaigns` | Edit | Optional |
| 16 | **NEW** `cover_image_url` | Edit | Optional |
| 17 | `approval_status` | System | Gates public visibility |
| 18 | `profiles.name`, `phone`, `registered_address`, `gst_number` | Signup | 🔒 **Private only** |

**Infrastructure needed:**
- Migration `021_*` (suggested): new business columns + influencer additions
- `get_public_business(slug)` RPC
- `business-logos` storage bucket (mirror `avatars` from migration `013`)
- Fix `register_profile` to write all business signup fields

---

## Next Steps Before Profile UI

Do **not** design Influencer Public Profile or Business Public Profile pages until:

1. **Register/signup payloads** persist every field collected in the 4-step wizards (especially business steps 2–4).
2. **Migrations** add missing columns from the checklists above.
3. **Public RPCs** return exactly the public checklist fields — no PII (phone, GST, registered address).
4. **Logo/avatar upload** wired at signup or immediately post-login (not preview-only).
5. **`get_public_business`** exists with slug-based lookup.

Suggested implementation order:
1. Migration `021` + updated `register_profile`
2. Fix business React register payload (or bridge middleware like `influencer-signup-persist.js`)
3. Public RPC updates (`get_public_influencer` privacy fix + `get_public_business`)
4. Post-login profile completion wizards (influencer + business)
5. **Then** design public profile pages — every section backed by a field in this document

---

## Appendix: API Endpoints Reference

| Endpoint | Method | Role | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | Both | Signup + `register_profile` |
| `/api/auth/me` | GET/PATCH | Both | Session user; business profile update |
| `/api/influencer-profile/me` | GET/PATCH | Influencer | Full influencer profile |
| `/api/influencer-profile/avatar` | POST | Influencer | Avatar upload |
| `/api/influencer-profile/username/check` | GET | Influencer | Username availability |
| `/api/discover/influencers` | GET | Business | Creator discovery list |
| `get_public_influencer(slug)` | RPC | Anon/auth | Public creator profile |
| `get_public_business(slug)` | RPC | — | **Does not exist yet** |

---

## Appendix: Influencer Signup Option Lists (from UI)

**Niches:** Fashion & Beauty, Tech & Gadgets, Food & Cooking, Travel, Fitness & Health, Gaming, Finance, Lifestyle, Education, Entertainment, Sports, Parenting, Home Decor, Art & Design, Music, Comedy, Business, Environment

**Languages:** English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi

**Collab types:** reel, story, post, yt (YouTube Video), event (Event Appearance)

**Price tiers:** entry (₹1k–₹5k), standard (₹5k–₹10k), premium (₹10k–₹25k), pro (₹25k+)

**Genders:** Male, Female, Non-binary, Prefer not to say

## Appendix: Business Signup Option Lists (from UI)

**Business types:** Startup, SME, Enterprise, Agency, D2C Brand, E-commerce, NGO / Non-profit, Freelancer / Solo, Other

**Industries:** Fashion & Apparel, Beauty & Personal Care, Food & Beverage, Technology, Healthcare & Wellness, Finance, Education, Travel & Hospitality, Home & Lifestyle, Automotive, Entertainment & Media, Sports & Fitness, Real Estate, Other

**Budget ranges:** < ₹25k/month, ₹25k–₹50k, ₹50k–₹1L, ₹1L–₹5L, ₹5L–₹10L, ₹10L+, Other
