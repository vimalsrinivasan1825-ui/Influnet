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

### operations/ — *running, securing, deploying, testing*
| Doc | What's in it |
|---|---|
| [SECURITY.md](operations/SECURITY.md) | **Canonical.** Auth/data-access model, PII column lockdown, RLS conventions, and the full security-audit history (every finding + status). |
| [DEPLOYMENT.md](operations/DEPLOYMENT.md) | Cloud deployment runbook: prod Supabase, env vars, host setup, edge functions, Stream webhook, post-deploy smoke test, infra to-dos (Sentry/Upstash/backups). |
| [QA_AND_GO_LIVE.md](operations/QA_AND_GO_LIVE.md) | Manual QA / test script (step-by-step, expected results) + "path to a solid product" checklist. |
| [E2E_SYSTEM_FLOW_TEST.md](operations/E2E_SYSTEM_FLOW_TEST.md) | **Deep "nothing hidden" walkthrough.** Every flow (signup→link→discover→request→accept→12-stage project→chat) broken down as user-sees / does / backend / DB rows / verify-SQL, plus negative tests and what was verified live. |
| [LAUNCH_CONFIDENCE_2026-07-14.md](operations/LAUNCH_CONFIDENCE_2026-07-14.md) | Pre-launch readiness report: app-health verification, the HikerAPI verification integration, and the human-only prerequisites (API balance, migrations). |
| [SUPABASE.md](operations/SUPABASE.md) | Supabase project setup, auth email templates, field mapping (UI → DB). |
| [PHONE_OTP.md](operations/PHONE_OTP.md) | 2Factor SMS OTP setup: migration, edge-function deploy, client flows, security limits. |

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
