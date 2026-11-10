# Supabase — login & signup (business + influencer)

Your React UI is already built. It currently calls a **REST API** that does not exist on Firebase Hosting:

| UI action | Current call |
|-----------|----------------|
| Login | `POST /api/auth/login` `{ email, password }` |
| Business signup | `POST /api/auth/register` with `role: "business_owner"`, `companyName`, `industry`, … |
| Influencer signup | `POST /api/auth/register` with `role: "influencer"`, `bio`, `niche`, social handles, … |
| Session | `localStorage`: `influnet_token`, `influnet_user` |
| After login | Business → `/dashboard`, Influencer → `/dashboard/influencer` |

**Supabase is wired** via `influnet/supabase-auth-bridge.js` (intercepts **all** `/api/*` before the React bundle). Login, signup, and **dashboard** load without a Node backend. No influnet.io rebuild required.

For a permanent fix, move logic into the **influnet.io** React source (`docs/supabase-client.example.ts`) and rebuild.

---

## 1. Supabase project (Influnet)

| Setting | Value |
|---------|--------|
| **Project URL** | `https://hrpaqufvjcihnjrjnpej.supabase.co` |
| **Project ref** | `hrpaqufvjcihnjrjnpej` |
| **Dashboard** | [Open project](https://supabase.com/dashboard/project/hrpaqufvjcihnjrjnpej) |

**API key** (Settings → API):

- Use the **publishable** key (`sb_publishable_...`) or legacy **anon** key in `VITE_SUPABASE_ANON_KEY`
- A local `.env` is in this repo for builds (gitignored — never push it)
- Copy the same values into **influnet.io** `.env` when editing React source

Then: **Authentication → Providers → enable Email**

### Email OTP (login + signup) — fix “sign-in link” emails

If the email subject is **“Your sign-in link”** with a **Sign in** button, Supabase is still using the default **Magic Link** template. The app expects a **6-digit code**.

**Fix (one-time, in Supabase Dashboard):**

1. Open [Email Templates](https://supabase.com/dashboard/project/hrpaqufvjcihnjrjnpej/auth/templates)
2. Select **Magic Link** (this template is used for `signInWithOtp`)
3. Set **Subject** to: `Your Influnet verification code`
4. Replace the body with the contents of `docs/supabase-email-otp-template.html`
5. **Remove** any `{{ .ConfirmationURL }}` from the template — that variable forces a link email
6. **Must include** `{{ .Token }}` — that variable forces a 6-digit OTP email
7. Under **Authentication → URL Configuration**, add your app URLs to **Redirect URLs**, e.g. `http://localhost:5000/**` and your production domain

Supabase rule: `{{ .ConfirmationURL }}` in template → magic link. `{{ .Token }}` only → numeric OTP.

After saving the template, request a new code (old emails still contain links).

### Signup with email confirmation (production)

Keep **Confirm email** enabled under **Authentication → Providers → Email**.

Flow:

1. User completes signup → sees “Check your email…” and is sent to `/login`
2. User clicks **Confirm signup** link in email
3. User signs in → profile is saved from signup metadata (`ensureOwnProfileInDb` + `register_profile`)

Add redirect URLs (see §3) so the confirmation link returns to your app. Optionally set **Confirm signup** email template; default works.

For local testing only, you can temporarily disable “Confirm email”.

### Forgot password

Reset links redirect to `/reset-password`. Add these under **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:5000/reset-password`
- `https://your-production-domain/reset-password`

Ensure the **Reset password** email template is enabled (default Supabase template is fine).

---

## 2. Run database migration (recommended)

```powershell
.\scripts\apply-supabase-schema.ps1
```

In **SQL Editor**, paste and run:

- `supabase/migrations/001_profiles_auth.sql` — profiles & signup
- `supabase/migrations/002_collab_and_messages.sql` — **collab requests & messaging** (required for business → influencer requests and chat)
- `supabase/migrations/007_influencer_profile_extras.sql` — gender, Facebook/LinkedIn, extra social links (influencer Edit Profile)

**Login/signup work without 001** (data stored in Supabase Auth `user_metadata` only). **Profiles persist to Postgres after 001 is applied.** The auth bridge also creates a DB profile on login if one is missing.

This creates:

- `profiles` — `role`: `business_owner` \| `influencer` (matches your UI)
- `business_profiles` — company, GST, industry, collab preferences
- `influencer_profiles` — bio, niche, Instagram/YouTube/Twitter
- RLS so users only edit their own data; authenticated users can read influencers for discover
- `register_profile(jsonb)` — call after `signUp` to save signup form fields

---

## 3. Environment variables (influnet.io repo)

Create `.env` (do **not** commit):

```env
VITE_SUPABASE_URL=https://hrpaqufvjcihnjrjnpej.supabase.co
VITE_SUPABASE_ANON_KEY=paste_anon_key_from_dashboard
```

Rebuild and copy to this repo:

```powershell
cd D:\influnet.io\Influnet-Io\Influnet-Io
$env:BASE_PATH="/"
pnpm --filter @workspace/influnet build
D:\influnet\scripts\build-react-app.ps1
```

---

## 4. Wire the existing UI (influnet.io source)

Install in the React package:

```bash
pnpm add @supabase/supabase-js
```

Add `lib/supabase.ts` (see `docs/supabase-client.example.ts` in this repo).

### Login (`/login`)

Replace `ds.auth.login(email, password)` with:

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
// store session.access_token in localStorage as influnet_token (or migrate to supabase session only)
// load profile from public.profiles + business_profiles | influencer_profiles
```

### Business signup (`/signup/business`)

```ts
const { data: authData, error } = await supabase.auth.signUp({ email, password });
await supabase.rpc('register_profile', {
  payload: {
    role: 'business_owner',
    email,
    name,
    phone,
    companyName,
    industry,
    gstNumber,
    website,
    location,
    collabPreferences,
  },
});
// redirect to /dashboard
```

### Influencer signup (`/signup/influencer`)

Same pattern with `role: 'influencer'` and `bio`, `niche`, `instagramHandle`, etc.

### Logout

`supabase.auth.signOut()` and clear `influnet_token` / `influnet_user`.

### `/auth/me`

```ts
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
```

---

## 5. Field mapping (UI → database)

| Register JSON (today) | Supabase |
|----------------------|----------|
| `role: "business_owner"` | `profiles.role` |
| `role: "influencer"` | `profiles.role` |
| `companyName` | `business_profiles.company_name` |
| `collabPreferences` | `business_profiles.collab_preferences` (jsonb) |
| `niche` (array) | `influencer_profiles.niche` (jsonb) |
| `instagramHandle` | `influencer_profiles.instagram_handle` |
| `gender` | `influencer_profiles.gender` |
| `facebookHandle` | `influencer_profiles.facebook_handle` |
| `linkedinHandle` | `influencer_profiles.linkedin_handle` |
| `extraSocialLinks` | `influencer_profiles.extra_social_links` (jsonb) |

### What is persisted automatically

| Action | Supabase Auth | Postgres tables |
|--------|---------------|-----------------|
| Login | session tokens | `profiles` + role table (created if missing) |
| Signup | user + metadata | `register_profile` RPC → `profiles`, `business_profiles` or `influencer_profiles` |
| Settings (business) | metadata | `PATCH /api/auth/me` |
| Influencer Edit Profile | metadata | `PATCH /api/influencer-profile/me` |
| Page reload | session refresh | `GET /api/auth/me` + bridge hydration syncs `influnet_user` from DB |

---

## 6. What stays on Firebase

- **Firebase Hosting** — still serves `influnet/` (HTML + JS)  
- **Supabase** — database + auth only  

No conflict: the browser talks to `*.supabase.co` directly.

---

## 7. Later tables (not in v1 migration)

When you connect dashboards and discover:

- `shortlists`, `collab_requests`, `conversations`, `messages` — mirror existing `/api/...` routes in the bundle

---

## Checklist

- [ ] Supabase project created  
- [ ] Migration `001_profiles_auth.sql` applied  
- [ ] Email auth enabled  
- [ ] `.env` in influnet.io with URL + anon key  
- [ ] Replace `ds.auth.*` with Supabase in source  
- [ ] Rebuild → `influnet/assets/`  
- [ ] Test `/login`, `/signup/business`, `/signup/influencer` locally (`.\scripts\serve-local.ps1`)

When you have the **influnet.io** repo open in Cursor, ask to “wire Supabase auth to login and signup pages” and we can edit the real source files.
