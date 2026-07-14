# Influnet — Roadmap, Status & Build Specs

What's built, what's left, and the open decisions. For the deep manual test list and the prioritized "path to a solid product," see [../operations/QA_AND_GO_LIVE.md](../operations/QA_AND_GO_LIVE.md). For deploy steps, [../operations/DEPLOYMENT.md](../operations/DEPLOYMENT.md).

---

## 1. Feature status matrix

| Area | Status | Notes |
|---|---|---|
| Auth (email/password + session) | ✅ | Live-session tokens; proxy route-gating; open-redirect guarded. |
| Signup wizards (business/influencer) | ✅ | Multi-step; admin-approval gate for business. |
| Phone OTP (2Factor) | ✅ backend / ⚠️ UI | Edge function + rate limits intact; UI wired in signup. |
| Public profiles `/c/`, `/b/`, `/influnet/[slug]` | ✅ | Via `get_public_*` SECURITY DEFINER RPCs; link-in-bio redirect. |
| Discovery (search/filter/pagination) | ✅ | Server-side search RPCs (048), keyset pagination, deep-link fallback. |
| Collab requests | ✅ | One pending per pair; atomic accept RPC creates project + conversation. |
| Project pipeline (12 stages) | ✅ | Shared `lib/project-lifecycle.ts`; per-role `STAGE_ACTOR`; progress %. |
| Workspace (Kanban, assets, stage progress) | ✅ | dnd-kit cards; 25MB asset uploads; `stage_progress` timestamps. |
| Messaging (Stream Chat) | ✅ | Token self-scoped; webhook mirrors to Postgres; unread bell; presence. |
| Notifications | ✅ | DB triggers → Supabase Realtime bell; summary endpoint. |
| Dashboards (business/influencer/admin) | ✅ | Metrics from `campaign_projects.status`; "Pipeline value" (not "earnings"). |
| Admin approval + management | ✅ | `withAdmin` service-role; approvals/users/collabs/projects. |
| **Verification & trust badge** | ✅ code + live-tested / ⚠️ needs migrations | Live Instagram checks via a 2-provider seam (`lib/instagram.ts`): **Apify default** (free credit, happy path verified live) + HikerAPI alt. Auto-approve or escalate to admin queue; never blocks access. Needs migration `055` applied on hosted DB — see [LAUNCH_CONFIDENCE_2026-07-14](../operations/LAUNCH_CONFIDENCE_2026-07-14.md). |
| **Reviews & ratings** | 🟡 built, verifying | Table + RLS + route done this round; run QA to confirm live. |
| **Payments** | ⛔ not built | Stages are cosmetic; no gateway/records. **Decision open (§4).** |
| **Completion outcomes** (showcase, reputation ranking) | ⛔ not built | See §3. |
| Dashboard per-project progress bar + "whose turn" | 🟡 partial | `stageProgressPercent()` exists; wire into home cards. |

---

## 2. Remaining backlog (prioritized)

Priorities: **P0** before any public traffic · **P1** before real/paying users · **P2** quality/growth. Infra P0/P1 items live in [DEPLOYMENT.md §5](../operations/DEPLOYMENT.md); the full ranked checklist is in [QA_AND_GO_LIVE.md Part C](../operations/QA_AND_GO_LIVE.md).

**P0 (infra/data safety):** separate prod Supabase · secrets in host store + remove `SUPABASE_ACCESS_TOKEN` · DB backups/PITR · CI as merge gate · apply & verify migrations.

**P1 (before real users):** Sentry · Upstash rate limiting · **payments decision (§4)** · admin audit log · content/abuse safety (report/block) · storage policy review · email/SMTP deliverability.

**P2 (quality/growth):** reputation→discovery ranking · completion showcase · dashboard progress+next-action · two-party confirmation on money/completion stages · RLS regression tests (un-skip the 6 integration tests) · observability/`/healthz` · legal (ToS/Privacy/data-deletion) · a11y + responsive pass.

---

## 3. Build specs — making completion meaningful

Conventions: `profiles.id` UUID; `campaign_projects.id` BIGINT; RLS uses the participant `EXISTS` pattern; migrations append-only; shared TS lifecycle logic in `apps/web/src/lib/project-lifecycle.ts`.

### G2 — Reviews & ratings *(built this round — verify)*
- Table `public.reviews` (`project_id BIGINT`, `from_user_id`, `to_user_id`, `rating 1–5`, `comment`, unique `(project_id, from_user_id)`), migration `051`.
- RLS enforces in the DB: `INSERT` only for a **participant of a completed project**, reviewing the **other** party; SELECT public; author-only update/delete.
- Route `POST/GET /api/projects/[id]/reviews`. Aggregate for public profiles via a `get_creator_rating`-style RPC (add if not present).
- **Acceptance:** review only a completed project you were in, once per side (409 on repeat); can't review yourself or a project you weren't in (RLS blocks); public profile shows aggregate with no PII leak.

### G3 — Payments *(decision first — §4)*
- Table `public.project_payments` (`project_id BIGINT`, `kind advance|final`, `amount`, `currency`, `provider manual|razorpay`, `status pending|paid|failed|refunded`, `provider_ref`, unique `(project_id, kind)`).
- **Option A (Razorpay):** server creates order → client pays → **signature-verified webhook** (mirror `api/stream/webhook`) is the *only* writer of `status='paid'`. Gate `advance_payment`/`final_payment` on a matching paid record. Client must **never** self-report `paid`.
- **Option B (off-platform V1):** `provider='manual'`; business marks paid, creator confirms received; relabel the UI stages so no one expects escrow.
- Then redefine dashboard earnings/spend = sum of **paid** amounts (not accepted budget).

### G4 — Completion outcomes & dashboard progress
- On `project_completed`: unlock review prompt; (ideally) require final payment settled; add to creator's opt-in **completed-work showcase** on `/c/[username]`; feed `rating + completed count` into discovery ordering.
- Home dashboards: per-project **progress bar** (`stageProgressPercent`) + **"whose turn"** label from `STAGE_ACTOR`.

---

See also **[PROJECTS_AND_VERIFICATION.md](PROJECTS_AND_VERIFICATION.md)** for the deeper product analysis of the pipeline/Kanban model and the trust & verification badge system that feeds several P2 items above.

## 4. Open decisions (not yet made)

| Decision | Options | Recommendation |
|---|---|---|
| **Payments in V1** | A: Razorpay integration · B: manual two-party milestone confirmation | **B for V1** (fastest, honest), Razorpay in V1.1. Record the choice in [DECISIONS.md](DECISIONS.md). |
| **Session architecture end-state** | Keep Bearer-token APIs · consolidate to cookie/`@supabase/ssr` | Keep Bearer for V1; consolidate in V1.1. |

Decisions already made are logged in [DECISIONS.md](DECISIONS.md) (stack choice D-001, OTP reuse D-002).

---

## 5. History
Detailed point-in-time plans and audits (execution phases, V1 readiness, deep codebase analysis) are preserved verbatim in [../archive/](../archive/). This roadmap supersedes them as the living source of status.
