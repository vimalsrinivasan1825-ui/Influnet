# Full Web + Mobile Audit — Plan (2026-07-30)

**Status: plan only, not started.** Nothing below has been executed. This is proposed scope for your approval before I begin.

## Why a new audit, given the two rounds already done

The [2026-07-30 audit](FULL_E2E_AUDIT_2026-07-30.md) and its [two remediation rounds](AUDIT_REMEDIATION_2026-07-30.md) covered the **creator/business core loop** end to end — signup through a completed, paid, reviewed project — plus everything found broken or missing along the way. That was thorough for the path it walked, but it wasn't a full-surface audit: it didn't systematically touch **admin workflows beyond approvals**, **mobile-specific behavior** (offline, push delivery, deep links, background/foreground transitions), **accessibility**, **performance under load**, or **security beyond the specific IDOR class already found**. This plan is that wider sweep.

## Scope

### 1. Web — admin & operational surfaces (not covered by the core-loop audit)
- Every `/dashboard/admin/*` screen: users, projects, collabs — not just approvals
- Admin actions' audit-log completeness (does every admin write get logged?)
- Bulk/edge-case admin operations: what happens deleting a user with active projects, cancelling from the admin side, etc.

### 2. Mobile — full parity + mobile-only concerns
- Every screen exercised the same way the web core-loop was: signup, requests, projects, chat, reviews, settings — on-device or simulator, not just typecheck/bundle
- Push notification actual delivery (not just that the send-side code compiles) — needs the FCM/APNs credential state resolved first (see confidence report)
- Deep link handling (`influnet://...` and universal links) for every notification type
- Offline/poor-network behavior: what happens mid-request with no connection
- App lifecycle: background → foreground token refresh, session survival across app kills
- Physical-device pass on both iOS and Android (the reanimated crash history means simulator-only testing has previously missed real bugs)

### 3. Security — beyond the known IDOR class
- Systematic authorization sweep: for every `/api/*` route, verify participant/ownership checks exist (the reviews/cards IDOR was found by walking the app, not by systematically auditing every route — do the systematic pass now)
- Rate limiting coverage: which routes have it, which don't, is it enforced in production (Redis-backed) or only the in-process fallback
- File upload validation (Cloudinary signing) — content-type/size limits, path traversal
- Admin-role escalation paths beyond the one already fixed (migration 070)

### 4. Data integrity & migrations
- Full migration-state verification against the hosted DB (method already established — see [[hosted-db-migration-state]] equivalent doc), not just spot-checks
- RLS policy audit: for every table with sensitive data, confirm policies match intent (the reviews/cards gap showed RLS alone isn't a substitute for API checks — verify this isn't true elsewhere)

### 5. Performance
- Page load / API response times under realistic data volumes (the audit accounts have small data sets; a business with 500 collab requests may behave differently)
- Mobile app cold-start time, list rendering with large datasets

### 6. Accessibility
- Screen reader pass on both platforms for the core flows
- Color contrast, touch target sizes (mobile), keyboard navigation (web)

## What's explicitly out of scope (unless you want it added)

- Load/stress testing at production traffic volumes (needs a real target number)
- Penetration testing by a third party (this is a code-level audit, not a pen test)
- Localization/i18n (product is India-focused, single language observed)

## Method

Same approach as the last two rounds: build a rerunnable Playwright suite for web (extending `tests/e2e/`), do device/simulator passes for mobile with screenshots, verify every finding against live app state (not just code review), and fix what's found — with the lesson from this round's incident applied: **any DB write during verification gets scoped with an explicit id allowlist and a dry-run SELECT first, especially near existing audit reference data.**

## Estimated shape

Roughly the same size as the work already done in this session (two multi-hour rounds) — this is a comparable scope, split into the 6 areas above. I'd suggest doing them in the order listed (1→6), since security and mobile are higher-value than performance/accessibility for a pre-tester release, but that's a judgment call, not a requirement.

## Before I start

Two things are worth resolving first (see the confidence report) since they'd otherwise get rediscovered mid-audit:
1. **Mobile production environment** — currently points at the dev backend (confidence report, item 1)
2. **Push notification credentials** — FCM/APNs setup can't be verified from the repo alone

Tell me to go and I'll start at whichever area you want first — or all of them, if you want the full sweep.
