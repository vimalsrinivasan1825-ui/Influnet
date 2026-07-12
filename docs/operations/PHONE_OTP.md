# Mobile OTP verification (2Factor)

Production mobile verification for influencers and business owners uses the **2Factor** SMS API. OTP values are never stored in Influnet — only the provider session ID and verification status.

## Prerequisites

1. Active **2Factor** account with SMS OTP enabled.
2. Template name: `Login_Verification_OTP` (AUTOGEN flow).
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

### Option A — PowerShell script (recommended)

```powershell
npx supabase login
# Add TWOFACTOR_API_KEY=... to repo-root .env (see .env.example)
.\scripts\deploy-phone-otp.ps1
```

### Option B — CLI manually

```bash
npx supabase login
npx supabase link --project-ref hrpaqufvjcihnjrjnpej
npx supabase secrets set TWOFACTOR_API_KEY=your_2factor_api_key --project-ref hrpaqufvjcihnjrjnpej
npx supabase functions deploy phone-otp --project-ref hrpaqufvjcihnjrjnpej
```

### Option C — Supabase Dashboard

1. [Edge Functions](https://supabase.com/dashboard/project/hrpaqufvjcihnjrjnpej/functions) → deploy `phone-otp` from repo `supabase/functions/phone-otp/`
2. [Project Settings → Edge Functions → Secrets](https://supabase.com/dashboard/project/hrpaqufvjcihnjrjnpej/settings/functions) → add `TWOFACTOR_API_KEY`

Get your API key from [2Factor.in](https://2factor.in) → API / account dashboard.

The function (`supabase/functions/phone-otp/index.ts`) calls:

- **Send:** `GET .../SMS/{phone}/AUTOGEN/Login_Verification_OTP`
- **Verify:** `GET .../SMS/VERIFY/{sessionId}/{otp}`

Never put `TWOFACTOR_API_KEY` in client code or `supabase-config.js`.

## 3. Client integration

| File | Role |
|------|------|
| `influnet/supabase-auth-bridge.js` | `/api/phone-otp/send`, `/api/phone-otp/verify`, register gate, profile PATCH |
| `influnet/phone-otp-verification.js` | Signup + settings UI (Send OTP, 6-digit boxes, resend timer) |
| `influnet/phone-otp-verification.css` | OTP field styles |

`hide-business-otp.js` is removed — business signup now requires real verification.

## 4. User flows

### Signup (influencer / business) — phone OTP, email collected only

1. Enter name, **email** (contact info — no confirmation link), mobile, password.
2. Click **Send OTP** beside the mobile field.
3. Enter the 6-digit code (auto-advance inputs).
4. On success: **✓ Mobile Number Verified** — signup can complete.
5. Register calls `auth-signup` Edge Function (auto-confirms email server-side) or falls back to client `signUp` + immediate sign-in.
6. `phoneVerificationToken` proves the mobile number; `emailVerified: false` in profile metadata until you add email verification later.

Deploy `auth-signup` with `phone-otp`:

```powershell
npx supabase functions deploy auth-signup --project-ref hrpaqufvjcihnjrjnpej
```

Optional: Supabase Dashboard → Authentication → Email → disable **Confirm email** (fallback path if `auth-signup` is not deployed).

### Profile update

- Changing the phone number resets `phone_verified` until OTP is verified again.
- Save is blocked until the new number is verified.

## 5. Security limits

| Rule | Implementation |
|------|----------------|
| Max 5 OTP sends / hour / number | `phone_otp_send_allowed` RPC + audit log |
| Max 5 verify attempts / session | `phone_otp_register_verify_attempt` RPC |
| OTP TTL | 10 minutes (Edge Function `OTP_TTL_MINUTES`) |
| Verification token TTL | 30 minutes for signup/register binding |
| OTP values | Never stored — 2Factor AUTOGEN is source of truth |

## 6. Audit log

`phone_otp_audit_log` records actions: `send`, `verify_success`, `verify_fail`, `rate_limited`.

Query example:

```sql
SELECT action, status, phone_e164, created_at, meta
FROM phone_otp_audit_log
ORDER BY created_at DESC
LIMIT 50;
```

## 7. Troubleshooting

| Symptom | Check |
|---------|--------|
| "Deploy the phone-otp Edge Function" | Function deployed and `TWOFACTOR_API_KEY` secret set |
| "Too many OTP requests" | Wait 1 hour or check audit log for `rate_limited` |
| "Mobile verification expired" | Re-send OTP; token valid 30 min after verify |
| OTP not received | 2Factor dashboard, DND, correct `91` prefix number |

## 8. Dashboard badges

When `phone_verified = true`:

- Influencer dashboard hero: **✓ Verified Mobile**
- Business dashboard profile meta: **✓ Verified Mobile**
- Profile completion wizard includes **Verified Mobile** step
