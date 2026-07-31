# Sign-up / Sign-in / Verification — Web vs Mobile parity analysis

**Date:** 2026-07-31
**Branch:** `dev` @ `53cbfa0b`
**Scope:** read-only analysis. No code changed.

---

## 1. Verdict up front

Signup and sign-in are in **good shape** on both platforms — the last commit
(`53cbfa0b fix(mobile): close signup field/behavior gaps with web`) closed most
of the field-level gaps, and the server-side gates (username uniqueness, phone
OTP re-validation, approval-status stripping) are enforced in
`/api/auth/register` regardless of which client calls it.

**Verification is a different story. The mobile Instagram-ownership flow is not
"somewhat missing" — it is wired up in the UI but non-functional.** The screen
exists (`apps/mobile/app/verification.tsx`), it looks complete, and every button
on it is reachable. But the requests it sends are missing a required field, so
the server rejects them. A creator tapping **"Get my code"** on mobile today
gets the error `A handle is required` and can never proceed.

There are three separate bugs stacked on top of each other in that one flow, so
fixing only the obvious one will not make it work.

---

## 2. Background: there are TWO verification systems, not one

This trips people up, and the mobile screen partially conflates them. They are
independent:

| | **Ownership claim** (bio-code handshake) | **Trust pipeline** (metrics + review) |
|---|---|---|
| Question answered | "Is this Instagram account actually yours?" | "Is this account real and worth a badge?" |
| API | `/api/verification/ownership` | `/api/verification` |
| Mechanism | Issue `vf_xxx` code → user pastes in IG bio → server scrapes live bio and matches | Scrape follower/engagement/recency signals → score → auto-verify, review, or reject |
| DB | `social_account_claims`, RPCs `initiate_social_claim` / `confirm_social_claim` (migration 058) | `verification_checks`, RPC `submit_verification` (locked down by migration 083) |
| Grants the badge? | **No** — `confirm_social_claim` only flips the claim row to `verified` (`058_social_account_ownership.sql:132-141`) | **Yes** — this is the only path that sets `verified_badge` |

The link between them: `/api/verification/route.ts:130-143` reads the ownership
claim and sets `signals.ownership_verified`. Without a verified claim, `decide()`
will not auto-verify (anti-impersonation). **So ownership is a prerequisite, and
the trust pipeline is what actually badges you.**

Web handles this correctly: on successful ownership confirm, the panel
immediately fires the pipeline —
`apps/web/src/components/dashboard/instagram-ownership-panel.tsx:75`:

```ts
apiFetch("/api/verification", { method: "POST" }).catch(() => {});
```

Mobile does not do this. More below.

---

## 3. P0 — Mobile ownership verification is broken end-to-end

Three independent defects. All three must be fixed for the flow to work.

### P0-1 — Every ownership request omits `handle` → hard 400

The shared endpoint helpers take a body but the screen never supplies the
handle or platform.

`packages/api/src/endpoints.ts:152-153`
```ts
checkOwnershipStatus: <T>() => api.get<T>('/api/verification/ownership'),
checkOwnership:       <T>(body: unknown) => api.post<T>('/api/verification/ownership', body),
```

`apps/mobile/app/verification.tsx:119` and `:136`
```ts
endpoints.checkOwnership({ action: 'initiate' })   // no handle
endpoints.checkOwnership({ action: 'confirm'  })   // no handle
```

Server, `apps/web/src/app/api/verification/ownership/route.ts:66-68`:
```ts
const handle = normalizeHandle(body?.handle);
if (!handle) return jsonError(400, 'A handle is required');
```

`normalizeHandle(undefined)` returns `null` (`lib/hikerapi.ts:94-95`), so this is
an unconditional 400. The message surfaces in the mobile UI's warning card.

**Impact:** the bio-code flow has never worked on mobile. Not degraded — dead.

### P0-2 — Status GET omits `?handle=` → always reports "none"

Same root cause on the read path. `route.ts:36-37`:
```ts
const handle = normalizeHandle(url.searchParams.get('handle'))?.toLowerCase();
if (!handle) return NextResponse.json({ status: 'none' });
```

Consequences on `verification.tsx`:
- `data?.status` is permanently `'none'`, so line 113's `verified` only ever
  comes from `profile.verified_badge` — the *other* pipeline. The screen cannot
  tell you your IG account is verified as yours.
- A `pending` claim (code issued, user is mid-flow, 30-min TTL) is invisible.
  Backgrounding the app loses the claim state entirely; `code` is component
  state only.

### P0-3 — Confirm response shape mismatch → success reads as failure

`route.ts:153-160` returns `{ verified: false, message }` or `{ verified: true, result }`.
There is **no `status` field** in either branch.

`apps/mobile/app/verification.tsx:136-151`
```ts
const res = await endpoints.checkOwnership<{ status: string }>({ action: 'confirm' });
...
if (res.data?.status === 'verified') { ...success... }
else { setMessage("We couldn't find the code in your bio yet...") }
```

So even after P0-1/P0-2 are fixed, a genuinely successful confirm falls into the
else branch and tells the creator it failed — while the DB has already flipped
the claim to `verified`. They'd retry, and `confirm_social_claim` raises
`No pending, unexpired verification to confirm — start again`.

This is the same class as the known **API envelope mismatch** issue: the route
builds its JSON inline and the call site asserts a shape nobody checks.

### Fix sketch (P0)

1. Widen the helpers to carry the handle:
   ```ts
   checkOwnershipStatus: <T>(handle: string, platform = 'instagram') =>
     api.get<T>(`/api/verification/ownership?platform=${platform}&handle=${encodeURIComponent(handle)}`),
   checkOwnership: <T>(body: { action: 'initiate' | 'confirm'; handle: string; platform?: string }) =>
     api.post<T>('/api/verification/ownership', { platform: 'instagram', ...body }),
   ```
2. Pass `profile.instagram_handle` (already in the store —
   `apps/mobile/lib/session.ts:40`) from all three call sites; skip the fetch
   entirely when it's null rather than firing a doomed request.
3. Read `res.data?.verified === true` on confirm, and surface
   `res.data?.message` when false — the server writes a better message than the
   hardcoded one.

---

## 4. P1 — Structural gaps that block the flow even once P0 is fixed

### P1-1 — Mobile never chains the trust pipeline after ownership confirm

Web fires `POST /api/verification` the instant ownership is proven. Mobile
doesn't. Since `confirm_social_claim` doesn't touch `verified_badge`, a mobile
creator would prove ownership, see a success state, and **still have no badge**
until they separately notice and tap "Run verification" higher up the same
screen.

Fix: mirror line 75 of the web panel — after a successful confirm, call
`endpoints.startVerification({})`, then `loadProfile()` + `refreshPipeline()`.

### P1-2 — There is no profile editing on mobile at all

`apps/mobile/app/(tabs)/profile.tsx` contains **zero** text inputs — no
`TextInput`, no `Field`, no editing `Sheet`. The only mutations are avatar/cover
image upload (`:293`) and section visibility (`:213`).

This directly dead-ends verification. `verification.tsx:264-271` renders:

> "Add your Instagram handle to your profile first — we need to know which
> account to check."

…with **no way to do that anywhere in the app.** A creator who signed up with
only a YouTube or X handle (which the mobile wizard permits —
`signup/creator.tsx:211-212` requires *any one* of the three) is permanently
locked out of verification on mobile.

Broader gap vs `apps/web/src/app/dashboard/settings/page.tsx`: mobile has no way
to edit name, phone, location, username, headline, bio, niches, languages,
collab types, price range, or any social handle. `PATCH /api/profile` already
supports all of it (`app/api/profile/route.ts:120-218`), so this is a UI build,
not a backend one.

### P1-3 — Business accounts cannot reach verification on mobile

Web renders `VerificationPanel` for **both** roles
(`settings/page.tsx:376`: `{(isBusiness || isInfluencer) && <VerificationPanel />}`),
and `/api/verification` explicitly accepts `business_owner` (`route.ts:59-61`).

On mobile, the only two links to `/verification` are inside `isCreator` branches
(`profile.tsx:657`, `:696`) plus a creator-only home nudge (`home.tsx:244`).
`app/settings.tsx` has **no verification row at all**. A business owner on mobile
has no entry point, even though the route file would render fine.

---

## 5. P2 — Signup / sign-in parity gaps

### P2-1 — Email-confirmation signups lose everything on mobile *(conditional severity)*

If the Supabase project has email confirmation enabled, `signUp` returns no
session, so `register_profile` can't run yet.

- **Web** stashes the whole payload in `localStorage` under
  `influnet_pending_registration` (`signup/influencer/page.tsx:291-296`) and
  replays it on first login (`login/page.tsx:52-82`), including a specific
  message for the `phone_unverified` 403 when the 30-minute OTP token lapsed.
- **Mobile** (`lib/use-signup.ts:99-103`) returns `needsConfirmation` and the
  wizard shows "Check your email to confirm your address, then sign in." The
  payload is dropped. `app/(auth)/login.tsx` has no replay logic.

Result: the user confirms, signs in, and `app/index.tsx:35` redirects to `/home`
with `profile === null` — signed in with no profile row and no path to create
one. The wizard data is technically still in auth metadata
(`use-signup.ts:94`), so recovery is possible, but nothing reads it.

*Severity depends on whether confirmation is currently on for this project.* If
it's off, this is latent; flipping it on later breaks mobile signup silently.

### P2-2 — No Instagram autofill on mobile signup

Web step 1 is "Connect your Instagram" — scrapes the handle and prefills name,
bio and follower count (`signup/influencer/page.tsx:142-174`), then shows a
"we pre-filled your details" banner. It's the single biggest friction reducer in
the wizard.

`endpoints.scrapeInstagram` **exists** in the shared package
(`packages/api/src/endpoints.ts:154`) and is **called from nowhere in mobile**.
The mobile wizard opens cold at "What's your name?".

### P2-3 — No username-taken recovery on mobile

Web's `recoverFromTakenUsername()` (`signup/influencer/page.tsx:182-206`) jumps
back to step 2, focuses the field, and offers two alternates it has already
checked are free. Mobile shows an error and jumps to step 1
(`signup/creator.tsx:69-74`) with no suggestions.

### P2-4 — "Re-verify & Refresh Data" does not re-verify on mobile

`verification.tsx:230-245` (verified state) calls `endpoints.refreshProfile()` →
`POST /api/profile/refresh`, which only re-captures social snapshots. The
identically-labelled web button (`verification-panel.tsx`) calls
`POST /api/verification`. Same label, different action.

---

## 6. P3 — Minor / polish

| # | Gap | Web reference |
|---|---|---|
| P3-1 | No password strength meter on mobile signup | `signup/influencer/page.tsx:20-34, 536-556` |
| P3-2 | No show/hide password toggle on the signup password field (mobile login *does* have one) | `signup/influencer/page.tsx:527-534` |
| P3-3 | Home verification nudge can't be snoozed; web snoozes 7 days and persists via `/api/profile/ownership-nudge` | `verify-ownership-nudge.tsx:30-37, 84-92` |
| P3-4 | No mobile equivalent of the 3-step `VerificationGuide` card on creator home | `components/dashboard/verification-guide.tsx` |
| P3-5 | `/vf/<code>` links open the web page; no deep link back into the app | `app/vf/[code]/page.tsx` |
| P3-6 | Password reset intentionally routes to the web page (documented decision, not a defect) | `app/(auth)/forgot-password.tsx:1-15` |

---

## 7. What is actually solid (no action needed)

- **Server-side gates are client-agnostic.** `/api/auth/register` strips
  `approvalStatus`, re-validates the phone OTP token against
  `phone_otp_sessions`, and rate-limits — mobile can't bypass any of it
  (`app/api/auth/register/route.ts:33-59`).
- **Phone OTP requirement is server-driven on mobile** (`useOtpRequirement()` →
  `/api/auth/config`) which is *better* than web's build-time
  `NEXT_PUBLIC_PHONE_OTP_ENABLED` inlining — relevant given the known env-var
  inlining traps. Mobile fails safe (assumes OFF) when config is unreachable.
- **Username availability** now fails open identically on both
  (`use-signup.ts:42-45` mirrors the web hook), with a submit-time re-check on
  both to avoid orphaned auth users.
- **Signup field coverage** matches after `53cbfa0b`: gender, city/state,
  languages, niches, collab types, price tier, GSTIN/website validation on the
  business side.
- **Sign-in ordering on mobile** is correct — sign out before navigating, single
  route mapper at `/`, token-scoped 401 handling in the shared client.
- **Mobile's pipeline panel is genuinely ahead of web** in one respect: it
  surfaces `needs_more_info` / `rejected` states with a re-run button
  (`verification.tsx:175-207`). That half works today, because
  `/api/verification` needs no request body.

---

## 8. Suggested order of work

**Ship 1 — make mobile verification work (small, high value)**
1. P0-1 handle threading (endpoints + 3 call sites)
2. P0-3 read `verified` instead of `status`
3. P0-2 status GET with handle; render `pending` claims so backgrounding doesn't lose the flow
4. P1-1 chain `POST /api/verification` after a successful confirm

Ship 1 is roughly a day and turns a dead screen into a working one. Worth adding
a regression test that asserts the request body contains a handle — this class
of bug is invisible to `tsc` because the helpers take `unknown`.

**Ship 2 — remove the dead ends**
5. P1-2 a mobile profile-edit screen (at minimum the social handles + bio)
6. P1-3 verification entry point for business accounts + a Settings row for both roles
7. P2-4 point the verified-state button at `/api/verification`

**Ship 3 — signup polish**
8. P2-1 pending-registration replay on mobile login (do this before ever enabling email confirmation)
9. P2-2 Instagram autofill step
10. P2-3 username suggestions
11. P3 items as time allows

---

## 9. Open question for you

Is **email confirmation** currently enabled on the Supabase project? That single
answer decides whether P2-1 is a latent trap or an active bug that breaks every
mobile signup today. I couldn't determine it from the repo.
