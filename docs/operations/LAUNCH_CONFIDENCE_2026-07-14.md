# Launch Confidence Report — 2026-07-14

**Question asked:** *Is the app fully functional such that verification was the only missing piece — and is the new HikerAPI verification integration solid enough to launch?*

**Verdict:** 🟢 **Yes, with two human-only prerequisites** (HikerAPI balance + hosted-DB migrations). The product loops are code-complete and pass automated verification; verification is now integrated and degrades safely when its provider is unavailable.

This is a point-in-time report. For living status see [../product/ROADMAP.md](../product/ROADMAP.md); for the verification design/implementation see [../product/PROJECTS_AND_VERIFICATION.md §2.9](../product/PROJECTS_AND_VERIFICATION.md).

---

## 1. Method

Static + behavioral verification of the current branch (`feat/dashboard-ui-improvements`):
- `tsc --noEmit` (typecheck) across the monorepo.
- `vitest run` (unit suite).
- `next build` (production build) across `web` + `landing`.
- Live probe of HikerAPI with the provided key to confirm auth + error mapping.
- Code review of the auth model, verification engine, admin escalation, and signup flows.

Product loops themselves (signup → link → discover → request → accept → 12-stage project → chat) were **not** re-driven here; they are covered by the standing E2E walkthrough in [E2E_SYSTEM_FLOW_TEST.md](E2E_SYSTEM_FLOW_TEST.md) and the ROADMAP status matrix, both of which report them ✅.

## 2. App-readiness findings

| Check | Before | After | Notes |
|---|---|---|---|
| Typecheck | ❌ 1 error | ✅ clean | `kanban-card.tsx` used an invalid Badge variant `"brandSoft"` → fixed to `"brand"`. Was a hard build blocker. |
| Unit tests | ❌ 2 failing | ✅ 78 passing | `validators.test.ts` had 2 **stale** tests: they built influencer payloads with no social handle, but the schema was (correctly) hardened to require ≥1 handle. Tests updated to match intended behavior; added a negative test. |
| Production build | ✅ | ✅ | `web` + `landing` compile successfully. |

**Conclusion:** aside from the two pre-existing failures above (now fixed), the app was and is functional. Verification was genuinely the last feature gap.

## 3. Verification integration (this round)

Implemented live social verification behind a **two-provider seam**, plugged into the pre-existing scoring engine (no rebuild). Full design + code map in [PROJECTS_AND_VERIFICATION.md §2.9](../product/PROJECTS_AND_VERIFICATION.md).

- **Apify** (`apify/instagram-profile-scraper`) — **the tested default.** Has free credit live today; returns follower count, Instagram's verified flag, private/business flags, and post-recency inline.
- **HikerAPI** — a drop-in alternative (faster REST, but needs account balance). Selectable via `VERIFICATION_PROVIDER`.

**What it does:** on signup (fire-and-forget) and from Settings, it fetches the user's Instagram handle, scores it, and either **auto-verifies** (high confidence) or **escalates to the admin queue** (medium/suspicious/provider-down). It **never auto-rejects** and **never blocks product access**.

**New admin cockpit:** `/dashboard/admin/approvals` now has a Verification Queue (both roles) showing AI score, live IG facts, and flags, with verify / ask-for-info / reject actions — the manual-review fallback.

**What was verified**
- ✅ **Full happy path, live with real data (Apify):** provider selector → `fetchInstagramProfile('@nasa')` → real mapped profile (104M followers, `verified: true`, business, last post 0d) → `enrichWithLiveData` → decision **`verified` (score 1.0)**. Also mrbeast/cristiano → verified; a non-existent handle → `not_found` → escalate.
- ✅ **Cost/latency measured:** ~$0.0026/profile (~$2.60/1,000; ≈1,900 runs on the $5 credit); ~12–15s/call.
- ✅ Enrichment unit tests (mocked provider): verified-account → auto-approve; non-resolving handle → escalate; inflated follower claim → escalate; credit-exhausted/outage → `live_check_unavailable` → escalate without throwing; no-handle / not-configured → skip cleanly.
- ✅ HikerAPI backend still maps a live `402` correctly (probed) — safe fallback if you switch providers.

## 4. Prerequisites before launch (HUMAN-ONLY)

1. **🟢 Live provider — RESOLVED.** Apify is wired as the default and works today on the $5 free credit; the happy path is verified live. Watch the credit (~1,900 verifications) and top up at `https://console.apify.com/billing` before it runs out — when a provider is out of credit the app degrades to manual review (no crash, no block).
2. **🔴 Apply DB migrations to the hosted project.** Verification depends on migration `055_verification_system.sql` (+ the `051–057` range). Per the project's migration-status notes these were pending on the hosted DB. Apply and verify them, or verification `POST` will 500 on the missing `submit_verification` RPC / `verification_checks` table.
3. **🟡 Rotate the Apify token (and HikerAPI key)** after launch — both were shared in plaintext during setup.
4. Standing infra P0s from the ROADMAP remain (separate prod Supabase, secrets in host store, backups/PITR, CI merge gate) — unchanged by this work.

## 5. Confidence

- **Product functionality:** High. Build + types + tests green; core loops E2E-covered.
- **Verification code:** High. Clean two-provider seam, safe degradation, admin fallback, tested — and the happy path is now proven live with real data.
- **Verification end-to-end in production:** High **once item 4.2 (migrations) is applied** — the only remaining gate is a one-time DB step, not code.
