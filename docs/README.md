# Influnet Documentation

**Start here.** This is the map to every doc in the project. Docs are grouped by topic; each folder has a single job. Dated point-in-time reports live in [`archive/`](archive/) — preserved verbatim, never delete them, but don't treat them as current.

Influnet is a premium influencer-marketing platform connecting **businesses** and **creators** — link-in-bio discovery, collaboration requests, a 12-stage campaign pipeline with a Kanban workspace, real-time chat, and an admin approval gate. Single Next.js 16 app (`apps/web`) backed by Supabase (Postgres + Auth + Storage + Edge Functions) and Stream Chat.

---

## 🧭 Reading order for a new agent / engineer

1. **[product/VISION.md](product/VISION.md)** — what Influnet is and the problem it solves (5 min).
2. **[architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)** — system design, modules, routes, data flows, DB schema (the canonical reference).
3. **[operations/SECURITY.md](operations/SECURITY.md)** — the auth/data-access model and the PII column-lockdown. **Read before writing any API route or migration** — it's the #1 source of "why did my query 500".
4. **[architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)** — tables, fields, onboarding data capture.
5. **[product/ROADMAP.md](product/ROADMAP.md)** — what's built, what's left, and the open product decisions.
6. **[../.agents/AGENTS.md](../.agents/AGENTS.md)** — the agent working rules (branching, commits, living docs).
7. **[../.agents/lessons_learned.md](../.agents/lessons_learned.md)** — the running log of what broke and how it was fixed.

When you're about to deploy: **[operations/DEPLOYMENT.md](operations/DEPLOYMENT.md)** then **[operations/QA_AND_GO_LIVE.md](operations/QA_AND_GO_LIVE.md)**.

Before handing the app to testers or users: **[operations/PRE_LAUNCH_CHECKLIST.md](operations/PRE_LAUNCH_CHECKLIST.md)** — the ordered, verifiable list of what must be switched on first.

---

## 📁 Doc map

### product/ — *why we're building this and what's next*
| Doc | What's in it |
|---|---|
| [VISION.md](product/VISION.md) | The problem, the solution, value for each side, the mission. |
| [ROADMAP.md](product/ROADMAP.md) | Feature status matrix, prioritized backlog, remaining work, build specs (reviews/payments), open decisions. |
| [PROJECTS_AND_VERIFICATION.md](product/PROJECTS_AND_VERIFICATION.md) | Product audit: pipeline-vs-Kanban model, the trust/verification badge system, and recommendations. |
| [DECISIONS.md](product/DECISIONS.md) | Decision log (ADR-style): stack choice, OTP reuse, payments direction. Add new decisions at the top. |

### architecture/ — *how the system is built*
| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | **Canonical.** Module map, per-module deep-dives, data-flow diagrams, API reference, DB schema, RLS overview. |
| [DATA_MODEL.md](architecture/DATA_MODEL.md) | User data model: what's captured at registration/onboarding/edit, per-table fields, field checklists. |
| [architecture.html](architecture/architecture.html) | Living visual architecture page (module cards + status pills + update log). Keep in sync with shipped behavior. |
| [MOBILE_ARCHITECTURE_STRATEGY.md](architecture/MOBILE_ARCHITECTURE_STRATEGY.md) | High-level strategy for adding a React Native (Expo) mobile app: shared Supabase, monorepo shape, code-sharing model. |
| [MOBILE_APP_PLAN.md](architecture/MOBILE_APP_PLAN.md) | **The detailed mobile build plan.** Codebase analysis, package extraction, mobile design system + component library, screen-by-screen redesign (tabs, stage timeline replacing Kanban), phased roadmap, risks. |
| [REALTIME_COMMUNICATION.md](architecture/REALTIME_COMMUNICATION.md) | **Real-time communication design.** Explains pull vs push-based updates, implementation patterns (SSE, WebSockets, LISTEN/NOTIFY), and the dynamic reload fix plan. |

### operations/ — *running, securing, deploying, testing*
| Doc | What's in it |
|---|---|
| [SECURITY.md](operations/SECURITY.md) | **Canonical.** Auth/data-access model, PII column lockdown, RLS conventions, and the full security-audit history (every finding + status). |
| [DEPLOYMENT.md](operations/DEPLOYMENT.md) | Cloud deployment runbook: prod Supabase, env vars, host setup, edge functions, Stream webhook, post-deploy smoke test, infra to-dos (Sentry/Upstash/backups). |
| [QA_AND_GO_LIVE.md](operations/QA_AND_GO_LIVE.md) | Manual QA / test script (step-by-step, expected results) + "path to a solid product" checklist. |
| [PRE_LAUNCH_CHECKLIST.md](operations/PRE_LAUNCH_CHECKLIST.md) | **Start here before a tester round.** P0/P1/P2 checklist with why / do / how-to-verify for each item: pending migrations, auth-email rate limits, redirect URLs, Sentry, App Insights, log collection, webhook domains, the mobile OTA publish. Plus the daily routine and the tester-issue triage flow. |
| [OBSERVABILITY.md](operations/OBSERVABILITY.md) | **Seeing inside the app during a tester round.** Which of the four questions (who signed up / where do they stall / is this deployment healthy / what broke) is answered where, request-id correlation, KQL queries, and what was deliberately not built. |
| [ANALYTICS.md](operations/ANALYTICS.md) | Turning on PostHog, Sentry, App Insights and the support/feedback system — all built but inert until keyed. Includes what's deliberately disabled (autocapture, session replay) and why. |
| [MOBILE_BUILD_STAGES.md](operations/MOBILE_BUILD_STAGES.md) | Mobile app build log: what each stage shipped, how it was verified, the remaining stages in order, and the Metro/dependency gotchas. |
| [ANDROID_DISTRIBUTION.md](operations/ANDROID_DISTRIBUTION.md) | **Android App Bundle (.aab)** distribution via Google Play Console Internal Testing track, invite management, and the 20-tester rule. |
| [E2E_SYSTEM_FLOW_TEST.md](operations/E2E_SYSTEM_FLOW_TEST.md) | **Deep "nothing hidden" walkthrough.** Every flow (signup→link→discover→request→accept→12-stage project→chat) broken down as user-sees / does / backend / DB rows / verify-SQL, plus negative tests and what was verified live. |
| [LAUNCH_CONFIDENCE_2026-07-14.md](operations/LAUNCH_CONFIDENCE_2026-07-14.md) | Pre-launch readiness report: app-health verification, the HikerAPI verification integration, and the human-only prerequisites (API balance, migrations). |
| [PRODUCT_CONFIDENCE_2026-07-26.md](operations/PRODUCT_CONFIDENCE_2026-07-26.md) | **Latest readiness report.** What a completed project leaves on both profiles, creator-visibility parity (web/mobile), the consent loopholes found and closed (incl. migration 081), live migration-state probe, and per-area confidence. |
| [FULL_E2E_AUDIT_2026-07-30.md](operations/FULL_E2E_AUDIT_2026-07-30.md) | **Latest, most thorough E2E pass.** Full Playwright audit (`tests/e2e/`) from signup through a fully completed, paid, reviewed project — real Razorpay payments, change requests, skip-stage, dual-confirm completion, reviews, real chat messages. 142 checks, 139 passed. Confirmed a real IDOR on `/api/projects/[id]/reviews` (no participant check) plus 10 other findings, ranked, with file:line. Has a rerunnable test suite, not just a report. |
| [AUDIT_REMEDIATION_2026-07-30.md](operations/AUDIT_REMEDIATION_2026-07-30.md) | **Fixes for the audit above.** Closes the reviews/cards IDOR (participant gate, 404-not-403), makes a placeholder Razorpay webhook secret fail closed in staging/production, the username false-"taken" bug, the dead `business_profiles` query, budget + GST/website validation, and the unauthorized-project spinner. Each fix verified live; 6 items left open with the reasoning. |
| [AUDIT_REMEDIATION_PHASE2_2026-07-30.md](operations/AUDIT_REMEDIATION_PHASE2_2026-07-30.md) | **Closes the 6 items left open above**, plus a 404 redesign and a full mobile-parity pass. Unifies `/dashboard/influencer` into `/dashboard`, adds the block-user UI (web + mobile), makes Connections real, and a second real bug found *while fixing the first*: `notFound()` doesn't set HTTP status when nested under a Client Component layout — fixed via a route rewrite. **Also discloses a real mistake**: an overly broad cleanup script deleted (and partially restored) child records on the audit's reference project. |
| [TESTER_READINESS_CONFIDENCE_REPORT_2026-07-30.md](operations/TESTER_READINESS_CONFIDENCE_REPORT_2026-07-30.md) | **Can we hand this to testers?** Web: yes (webhook secret pending). Mobile: not yet — the "production" EAS profile still points at the dev backend, and push credentials can't be verified from the repo. Confirms the business-approval gate is still enforced server-side. |
| [WEB_MOBILE_PARITY_2026-07-30.md](operations/WEB_MOBILE_PARITY_2026-07-30.md) | **Is everything in web also in mobile?** Route + API + call-site comparison. Five gaps fixed (propose project terms, forgot password, stage updates, project activity, verification status); two left needing a native dep + your decision (in-app payments, image upload). Lists what's deliberately web-only. |
| [FULL_AUDIT_PLAN_2026-07-30.md](operations/FULL_AUDIT_PLAN_2026-07-30.md) | **Plan only, not started.** Proposed scope for a wider audit beyond the core-loop work already done: admin surfaces, full mobile device pass, systematic per-route authorization sweep, migration/RLS audit, performance, accessibility. Awaiting go-ahead. |
| [HOME_ACTION_CONSOLE_2026-07-28.md](operations/HOME_ACTION_CONSOLE_2026-07-28.md) | Mobile Home rebuilt as a "whose move is it" console: the `projectTurn()` model, the stage-by-stage table of what each side sees, the two defects the stage-matrix sweep caught (deadlock + passive action text), and the portfolio work agreed for next round. |
| [SUPABASE.md](operations/SUPABASE.md) | Supabase project setup, auth email templates, field mapping (UI → DB). |
| [PHONE_OTP.md](operations/PHONE_OTP.md) | 2Factor SMS OTP setup: migration, edge-function deploy, client flows, security limits. |
| [RELIABILITY_TRUST_ROADMAP_2026-08-01.md](operations/RELIABILITY_TRUST_ROADMAP_2026-08-01.md) | **Analysis only, not started.** Environments/DB isolation, backups & DR, user-facing error handling, support/ticket pipeline, observability (Sentry/PostHog/uptime), and an honest take on agentic auto-fix. Tracked as a checklist in [DEPLOYMENT.md §5](operations/DEPLOYMENT.md#5-operational-gaps-to-close-before-real-traffic). |

### reference/ — *copy-paste examples*
| File | What it is |
|---|---|
| [supabase-client.example.ts](reference/supabase-client.example.ts) | Example Supabase client setup. |
| [supabase-email-otp-template.html](reference/supabase-email-otp-template.html) | Auth email OTP template. |

### archive/ — *historical snapshots (do not edit; superseded)*
Dated audits, handoffs, fix-instruction KTs, and completed execution plans. See [archive/README.md](archive/README.md). Their content has been folded into the canonical docs above; they remain for provenance and full detail.

---

## Where does new information go? (so we don't re-scatter)

| If it's about… | Put it in… |
|---|---|
| A new module, route, table, or data-flow change | `architecture/ARCHITECTURE.md` (+ update `architecture.html`) |
| New/changed fields captured from users | `architecture/DATA_MODEL.md` |
| A security finding, RLS/grant change, or auth-model change | `operations/SECURITY.md` |
| Deploy steps, env vars, infra services | `operations/DEPLOYMENT.md` |
| A test/QA procedure | `operations/QA_AND_GO_LIVE.md` |
| A product/tech choice with tradeoffs | `product/DECISIONS.md` (new entry at top) |
| A feature's status or the backlog | `product/ROADMAP.md` |
| What broke and how you fixed it this session | `.agents/lessons_learned.md` |

**Rule:** update the canonical doc in place. Do **not** create a new dated `FIX_*`/`HANDOFF_*`/`ACTIONS_*` file — those are what created the clutter this structure replaced. A session summary belongs in `lessons_learned.md`; durable facts belong in the canonical doc for their topic.
