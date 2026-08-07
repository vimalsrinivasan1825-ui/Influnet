# Mobile OTP verification (2Factor)

Production mobile verification for influencers and business owners uses the **2Factor** SMS API. OTP values are never stored in Influnet — only the provider session ID and verification status.

## Prerequisites

1. Active **2Factor** account with SMS OTP enabled.
2. A **DLT-approved SMS** template. Default in code: `Authentication_OTP`
   (AUTOGEN flow); override with the `TWOFACTOR_TEMPLATE` secret.

   > **A template name that is not DLT-approved does not fail — it silently
   > downgrades to a voice call.** The API still returns `Status: Success`, still
   > returns a session id, and still bills an SMS credit; the user just gets a
   > phone call reading out the digits.
   >
   > History: `Login_Verification_OTP` was the approved template until
   > 2026-08-07, when it was replaced by a newly registered `Authentication_OTP`.
   > (An *earlier*, unregistered `Authentication_OTP` was what delivered voice
   > calls in the 2026-07-30 test — same name, different registration state.)
   > If users report calls instead of texts, check the template name FIRST —
   > it is not a DLT registration problem.
3. Supabase project with migration **022** applied.

## 1. Apply database migration

Run in Supabase SQL Editor:

`supabase/migrations/022_phone_otp_verification.sql`

Adds to `profiles`:

- `phone_verified` (boolean, default `false`)
- `phone_verified_at` (timestamptz)
- `otp_verified_by` (text, e.g. `2factor`)

Also creates `phone_otp_sessions`, `phone_otp_audit_log`, and RPCs for rate limiting, session tracking, and verification tokens.

## 2. Deploy Edge Function

### Option A — CLI (recommended)

```bash
npx supabase login
npx supabase link --project-ref jaajosocopoicmqcffuu
npx supabase secrets set TWOFACTOR_API_KEY=your_2factor_api_key --project-ref jaajosocopoicmqcffuu
npx supabase functions deploy phone-otp --project-ref jaajosocopoicmqcffuu
```

### Option B — Supabase Dashboard

1. [Edge Functions](https://supabase.com/dashboard/project/jaajosocopoicmqcffuu/functions) → deploy `phone-otp` from repo `supabase/functions/phone-otp/`
2. [Project Settings → Edge Functions → Secrets](https://supabase.com/dashboard/project/jaajosocopoicmqcffuu/settings/functions) → add `TWOFACTOR_API_KEY`

Get your API key from [2Factor.in](https://2factor.in) → API / account dashboard.

The function (`supabase/functions/phone-otp/index.ts`) calls:

- **Send:** `GET .../SMS/{phone}/AUTOGEN/{TEMPLATE}`
- **Verify:** `GET .../SMS/VERIFY/{sessionId}/{otp}`

Never put `TWOFACTOR_API_KEY` in client code or `supabase-config.js`.

## 3. Turning it on

The signup gate is off until you set one flag, **after** the Edge Function above
is deployed. Enabling it first would reject every new registration.

```
NEXT_PUBLIC_PHONE_OTP_ENABLED=true
```

Set it in each environment's secrets (Vercel / Azure), not in git. The boot
banner prints `Mobile OTP: ENABLED (2Factor, signup gated)` when it's live.

Mobile reads the same switch **at runtime** from `GET /api/auth/config`, so
flipping it takes effect in already-installed builds within a minute — no new
binary, and no build-time flag to get out of sync.

## 4. Client integration

The pre-Next.js `influnet/*.js` files this section used to list are gone. Current
implementation:

| File | Role |
|------|------|
| `apps/web/src/lib/phone-otp.ts` | Edge Function proxy + server-side token validation |
| `apps/web/src/app/api/phone-otp/send/route.ts` | Send route (IP rate limit) |
| `apps/web/src/app/api/phone-otp/verify/route.ts` | Verify route (IP rate limit) |
| `apps/web/src/app/api/auth/config/route.ts` | Public `{ phoneOtpEnabled }` flag, for mobile |
| `apps/web/src/components/signup/phone-otp-field.tsx` | Web UI: Send OTP, 6 boxes, resend timer, Verified |
| `apps/web/src/app/api/auth/register/route.ts` | **The gate** — re-validates the token, stamps `phone_verified` |
| `apps/mobile/lib/use-phone-otp.ts` | Mobile OTP state + runtime flag hook |
| `apps/mobile/components/phone-otp-step.tsx` | Mobile wizard step |

The provider key is never in the app: both routes proxy to the Edge Function,
which is the only thing holding `TWOFACTOR_API_KEY`.

## 5. User flows

### Signup (influencer / business) — phone OTP, email collected only

1. Enter name, **email** (contact info), mobile, password.
2. Click **Send OTP** beside the mobile field.
3. Enter the 6-digit code (auto-advance inputs, auto-submits on the 6th digit).
4. On success: **✓ Verified** — the wizard's Continue unlocks.
5. `POST /api/auth/register` re-validates `phoneVerificationToken` against
   `phone_otp_sessions` before creating the profile, then calls
   `mark_profile_phone_verified`.

**The gate is server-side.** The UI disabling Continue is a convenience; the
register route is what actually refuses an unverified number, so calling the API
directly gains nothing:

```
{"error":"Mobile number is not verified.","reason":"phone_unverified"}  // 403
```

> **Keep Supabase "Confirm email" disabled.** With it on, `signUp` returns no
> session, so registration is deferred to first login — and the verification
> token only lives 30 minutes. Confirm slower than that and the replay fails the
> gate; login then says so and clears the stashed payload rather than dropping
> the user into a profile-less account.

To disable it: Supabase Dashboard → Authentication → Email → turn off
**Confirm email**. The `auth-signup` Edge Function auto-confirms server-side and
can be deployed alongside `phone-otp` for the same effect:

```bash
npx supabase functions deploy auth-signup --project-ref jaajosocopoicmqcffuu
```

### Profile update

- Changing the phone number resets `phone_verified` until OTP is verified again.
- Save is blocked until the new number is verified.

## 6. Security limits

| Rule | Implementation |
|------|----------------|
| Max 5 OTP sends / hour / number | `phone_otp_send_allowed` RPC + audit log |
| Max 5 verify attempts / session | `phone_otp_register_verify_attempt` RPC |
| OTP TTL | 5 minutes (Edge Function `OTP_TTL_MINUTES`) — must not exceed the validity in the DLT template text |
| Verification token TTL | 30 minutes for signup/register binding |
| OTP values | Never stored — 2Factor AUTOGEN is source of truth |

## 7. Audit log

`phone_otp_audit_log` records actions: `send`, `verify_success`, `verify_fail`, `rate_limited`.

Query example:

```sql
SELECT action, status, phone_e164, created_at, meta
FROM phone_otp_audit_log
ORDER BY created_at DESC
LIMIT 50;
```

## 8. Troubleshooting

| Symptom | Check |
|---------|--------|
| "Mobile verification is temporarily unavailable" | Function not deployed, or `TWOFACTOR_API_KEY` secret missing — real cause is in the server logs (`phone-otp function error:`) |
| "Mobile verification is not enabled." (503) | `NEXT_PUBLIC_PHONE_OTP_ENABLED` is not `true` in that environment |
| Users get a VOICE CALL instead of an SMS | `TWOFACTOR_TEMPLATE` is not DLT-approved. Set it to an approved one (`Authentication_OTP`) and redeploy — the template is read into a top-level const, so a running instance keeps the old value until it cold-starts |
| "Too many OTP requests" | Wait 1 hour or check audit log for `rate_limited` |
| "Mobile verification expired" | Re-send OTP; token valid 30 min after verify |
| OTP not received | 2Factor dashboard, DND, correct `91` prefix number |

## 9. Dashboard badges

When `phone_verified = true`:

- Influencer dashboard hero: **✓ Verified Mobile**
- Business dashboard profile meta: **✓ Verified Mobile**
- Profile completion wizard includes **Verified Mobile** step
