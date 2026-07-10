# Influnet — Product & Technology Decisions

> Running log of decisions we've made so they don't get lost or re-litigated.
> Add new decisions at the top with a date and a short "why".

---

## D-002 · Reuse the existing 2Factor phone-OTP system (2026-07-10)

**Decision:** Keep and reuse the SMS OTP verification stack that already exists in this repo.
Do not rebuild it and do not buy a new OTP service.

**What exists (all server-side, fully intact):**

| Piece | Where | Status |
|---|---|---|
| Edge function `phone-otp` (send + verify actions) | `supabase/functions/phone-otp/index.ts` | ✅ Complete, well-built |
| DB tables `phone_otp_sessions`, `phone_otp_audit_log` + columns `profiles.phone_verified/phone_verified_at/otp_verified_by` | migrations `022`, `026` | ✅ In migrations |
| Rate limiting (5 sends/hr/number, 5 verify attempts/session, 10-min OTP TTL, 30-min verification token) | RPCs in migration 022 | ✅ Done |
| Audit logging of every send/verify/rate-limit event | `phone_otp_audit_log` | ✅ Done |
| Helper edge function `auth-signup` (server-side signup + email auto-confirm) | `supabase/functions/auth-signup/index.ts` | ✅ Intact |
| Signup/settings OTP **UI** (Send OTP button, 6-digit boxes, resend timer) | was in the deleted legacy site (`legacy-archive` tag: `influnet/phone-otp-verification.js`) | ❌ Needs rebuild in Next.js |
| Setup guide | `docs/PHONE_OTP_SETUP.md` | ⚠️ References the OLD Supabase project ref |

**Security design worth keeping:** OTP values are never stored by Influnet — 2Factor's
AUTOGEN session is the source of truth; we store only the provider session id + status.

**To activate it (in order):**
1. Have an active [2Factor.in](https://2factor.in) account with the `Login_Verification_OTP`
   AUTOGEN template.
2. Verify migrations 022 + 026 are applied to the **current** Supabase project
   (`jaajosocopoicmqcffuu` — note: `docs/PHONE_OTP_SETUP.md` still says the old ref
   `hrpaqufvjcihnjrjnpej`; use the ref from `supabase/config.toml`).
3. `npx supabase secrets set TWOFACTOR_API_KEY=... --project-ref jaajosocopoicmqcffuu`
4. `npx supabase functions deploy phone-otp --project-ref jaajosocopoicmqcffuu`
5. Build a small OTP component in the Next.js signup wizard (apps/web) that POSTs
   `{ action: 'send' | 'verify', phone, otp?, providerSessionId?, userId? }` to the
   function URL. The legacy UI at tag `legacy-archive` is the UX reference.

**Why reuse:** ~80% of the work (the hard, security-sensitive part) is already done and
battle-tested against real 2Factor responses; only the UI layer was lost with the legacy
site. 2Factor is India-appropriate (matches our v1 market).

---

## D-001 · Keep the current stack; no marketplace framework; buy at the service level (2026-07-10)

**Decision:** Do **not** migrate to a marketplace platform (Sharetribe) or a SaaS
boilerplate (MakerKit, Supastarter, next-forge). Keep building on the current stack and
continue outsourcing infrastructure to hosted services.

**The stack (for the record — "where is the backend?"):**

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js + React (`apps/web/src/app`), Tailwind v4, shadcn/ui | Everything users see |
| Backend — app logic | **Next.js API routes** (`apps/web/src/app/api/`) | Server-side code in the same codebase; this is why there's no separate Express/Django server |
| Backend — data & auth | **Supabase** (PostgreSQL + RLS, Auth, Storage, Edge Functions, Realtime) | All data lives here |
| Backend — chat | **Stream Chat** (GetStream) | Hosted real-time messaging |
| Monorepo | npm workspaces + Turborepo | `npm run dev/build/test` from repo root |

**Why not a pre-built marketplace framework:**
- Sharetribe et al. fit generic listing marketplaces; our core loops (12-stage campaign
  pipeline, admin approval gate, India-specific onboarding, link-in-bio acquisition) would
  fight their data model constantly.
- SaaS boilerplates sell the exact foundation we already have (Next.js + Supabase + auth +
  dashboards) — adopting one now means re-porting working code for zero new features.
- There is no credible open-source influencer-marketplace codebase; the commercial ones
  (GRIN, Upfluence, Modash) are competitors, not frameworks.

**Where we DO buy instead of build (the pattern to continue):**

| Need | Service to use | When |
|---|---|---|
| Auth, database, storage | Supabase | ✅ already |
| Real-time chat | Stream Chat | ✅ already |
| SMS OTP (India) | 2Factor via our edge function | see D-002 |
| Notifications (in-app + email) | Supabase Realtime + **Resend** (simple path, fits ~2k users) — or **Novu**/**Knock** if we later want one API for in-app/email/SMS/push | Phase 2 (EXECUTION_PLAN Task 2.1/2.2) |
| Payments | **Razorpay** (India-standard; never build payment handling) | Phase 3 |

**Rule of thumb going forward:** build what differentiates us (pipeline, matching,
link-in-bio, approval/trust); buy everything that doesn't (auth, chat, notifications,
payments, SMS).
