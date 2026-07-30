# Tester Readiness — Confidence Report (2026-07-30)

**Question this answers:** can we hand this to external testers right now — specifically the mobile app?

**Short answer: Web — yes, with one thing to set (Razorpay webhook secret). Mobile — not yet. One blocker (production build points at the dev backend) and one unknown (push notification credentials) need resolving first. Both are config/infra, not code.**

---

## Business approval gate — answering your question directly

**It's still there, still enforced, server-side.** A new business account gets `approval_status = 'pending_review'` on signup and cannot send a single collaboration request until an admin approves them from `/dashboard/admin/approvals`. This is checked in the API route itself (`POST /api/collabs`), not just hidden in the UI — a business account calling the API directly, bypassing the UI entirely, still gets blocked with a 403. The admin approve/reject action is fully wired end-to-end.

You weren't misremembering — this was briefly *broken* a while back (a query that silently returned nothing under a later PII-lockdown change, which accidentally blocked every business instead of letting any through), and got fixed forward. It's not gone; it's confirmed working right now.

One real gap I found while checking: this is enforced only in that one API route — there's no database-level policy backing it up independently. If a second code path ever writes to `collab_requests`, it wouldn't inherit this check automatically. Not urgent, just worth knowing.

---

## Web app: confidence — high

- **142 real E2E checks** across the full creator/business lifecycle (signup → paid, completed, reviewed project), re-verified after two remediation rounds — currently 125–143/134–145 depending on which phases were last run clean (phase 3 has one session-local test-data flake, not a code bug — see the phase-2 remediation report).
- **233 unit tests**, typecheck, and production build all clean.
- Every finding from the original audit is fixed except the one you own: **the Razorpay webhook secret is still a placeholder** — the code now actively refuses to accept payments with it in staging/production (fails closed, not open), so this isn't a security hole, but payment confirmation won't work until you set a real one.
- CI/CD is further along than my own memory of it suggested — GitHub Actions workflows for CI, staging deploy, prod deploy, and CodeQL all exist, plus a Dockerfile. I hadn't re-checked this in 18 days and would have told you it was still TODO if I hadn't looked just now.
- One small DB gap: migration 093 (realtime for payment confirmation) isn't applied on the hosted DB yet. Cosmetic only — a completed payment won't show live on the project screen until a manual refresh, nothing breaks.

**Verdict: web is in good enough shape for testers today.** The webhook secret is the one thing I can't do for you.

---

## Mobile app: confidence — not yet, two things first

### Blocker: the "production" build talks to the dev backend
`eas.json`'s `production` profile has the exact same API URL and Supabase project as `preview` — both point at `dev.influnet.io` and the dev database. This was a deliberate temporary stopgap (a commit literally titled pointing mobile at the dev backend) that never got reverted before production build config was added on top of it. `docs/operations/DEPLOYMENT.md` already documents that a real production Supabase project needs provisioning separately — that step just hasn't happened yet.

**What this means concretely:** if you build the "production" EAS profile right now and hand it to a tester, they'd be reading and writing the dev database — the same one internal test accounts and this session's E2E runs live in. Not a security risk to them, but a real risk of confusing/broken data and of a tester accidentally becoming visible to your own dev testing.

**Fix:** provision a real production Supabase project, point `eas.json`'s production profile and `app.json`'s defaults at it and at the real production web deployment, then apply all 93 migrations there. This is infra work I can help execute once you've decided you want a separate production project — not something I should just do unilaterally given it touches deploy config.

### Unknown: push notification credentials
The client-side and send-side code is all correctly wired (Android's `google-services.json` is present, the web backend correctly posts through Expo's push service, iOS entitlement handling exists). What I **can't verify from the repo** is whether the actual server credentials are uploaded to EAS: an FCM V1 service account key for Android, and the Push Capability enabled on the App ID for iOS. There's a documented history of one real App Store build shipping without the iOS entitlement because that capability wasn't enabled yet.

**What this means concretely:** testers might silently not receive push notifications, with no error visible to them or to us from the client side. Worth a quick manual check (`eas credentials`) before promising testers push works.

### Everything else checked out clean
- The reanimated/worklets crash that hit the iOS simulator is fixed and the fix is currently applied (`buildFromSource` in package.json).
- No TODO/FIXME/XXX comments anywhere in mobile source suggesting known incomplete work.
- `.env.example` is complete and matches what the app actually reads.
- Mobile inherits every web-side fix automatically (same backend) and I did a full parity pass this session — the one mobile-specific bug found (a duplicate of the username-availability issue) is already fixed.

**Verdict: don't hand out a "production" build yet.** A **preview** or **preview-device** EAS build is safe to test right now (it's honest about pointing at dev/staging) — if what you actually want is "let real people try the beta on their phones without shipping a mislabeled production build," that's available today. Ship-to-real-production-store needs the two items above resolved first.

---

## What I'd suggest, in order

1. You set the Razorpay webhook secret (your call, as already agreed).
2. Decide: do you want a real production Supabase project now, or is dev/staging fine for the tester round you're planning? If testers = friends/beta users trying it out, a `preview` build pointed at the current dev backend is honest and fine. If testers = anything resembling a real launch, the production backend needs to exist first.
3. Run `eas credentials` (or point me at it) to confirm the push credentials are actually uploaded, so we're not promising testers something that silently doesn't work.
4. Once those are settled, I'd start the audit plan in [FULL_AUDIT_PLAN_2026-07-30.md](FULL_AUDIT_PLAN_2026-07-30.md) — say the word and I'll begin.
