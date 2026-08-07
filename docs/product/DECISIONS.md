# Influnet — Product & Technology Decisions

> Running log of decisions we've made so they don't get lost or re-litigated.
> Add new decisions at the top with a date and a short "why".

---

## D-003 · Deploy as one unified app; scale horizontally; split out a *worker*, not a frontend/backend (2026-07-12)

**Decision:** Keep Influnet as a **single unified Next.js app** (`apps/web`, pages + `/api/*`
together) and deploy it to **one host**. Do **not** split the frontend and backend into
separate deployable services. When independent scaling is eventually needed, extract a
**background worker service** for heavy async jobs — not a frontend-vs-backend split.

**Now (small → moderately bigger traffic):**
- One app, one host. **Railway** (existing `apps/web/Dockerfile`, `output: "standalone"`,
  `/api/health`) or Vercel — pick one, don't split.
- Scale by: horizontal instances + a bigger Supabase tier + **connection pooling
  (Supavisor/PgBouncer)** + CDN/caching on public `/b/[username]` and `/c/[username]` pages.

**Why not a frontend/backend split:**
- **Wrong bottleneck.** The Next.js layer (pages *and* API routes) is I/O-bound glue; the
  real work is in **Postgres** (126 RLS policies, 43 `SECURITY DEFINER` fns) and **Stream** —
  both already separate managed services. Splitting the Node app does nothing for the DB,
  which is what strains first (connections/throughput).
- **Same scaling curve.** Every page view triggers its own API calls, so FE and BE load rise
  together. A FE/BE split gives you two services with the *same* curve — no independent-scaling
  win. Railway/Vercel already scale the unified app horizontally.
- **Auth cost.** Auth is same-origin **Supabase cookies + RLS**. Splitting to two domains
  forces cross-origin cookies, CORS, and token forwarding — real complexity to solve a
  scaling problem we don't have. (Full cost of leaving this model: see
  [architecture/FUTURE_MIGRATIONS.md](../architecture/FUTURE_MIGRATIONS.md).)

**The split we *will* eventually want — web vs. worker:** when a genuinely heavy,
independently-shaped workload appears (image/media processing — e.g. the Unsplash
replacement — bulk notifications, verification scraping, analytics rollups, ML), extract
*that specific job* into a queue-backed worker service. Web scales on request volume, worker
scales on job volume — *different* curves, so the split earns its keep.

**Keep the future cheap (do this now, it's free):** keep all data access in `src/lib`, keep
API routes thin, and never let heavy work run inside a request handler. Clean seams make the
later worker extraction a small, safe lift instead of a rewrite.

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
| Setup guide | `docs/operations/PHONE_OTP.md` | ⚠️ References the OLD Supabase project ref |

**Security design worth keeping:** OTP values are never stored by Influnet — 2Factor's
AUTOGEN session is the source of truth; we store only the provider session id + status.

**To activate it (in order):**
1. Have an active [2Factor.in](https://2factor.in) account with the `Authentication_OTP`
   AUTOGEN template.
2. Verify migrations 022 + 026 are applied to the **current** Supabase project
   (`jaajosocopoicmqcffuu` — note: `docs/operations/PHONE_OTP.md` still says the old ref
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
