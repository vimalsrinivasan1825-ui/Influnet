# Creator Journey — End-to-End Walkthrough & Findings

**Date:** 2026-07-28
**Method:** Live browser-driven walkthrough on the running dev app (`localhost:3000`, Supabase `jaajosocopoicmqcffuu`), driving the product as a real creator and a real business, deliberately probing edge cases — not just the happy path. Backend claims verified directly against the live database and the real API routes.
**Persona:** Seeded a realistic creator account from the actual public data of **Madan Gowri** (Tamil YouTuber, ~8.85M YouTube subs / 2.8M Instagram), and a business account "Zestly Foods Pvt Ltd".

Migrations are fully in sync — **78 of 78 applied** on the hosted DB (the migration-lag blocker noted in earlier audits is cleared).

---

## TL;DR — Is it good?

**Yes, the core creator↔brand loop is genuinely strong and mostly production-ready.** Signup, live social scraping, the public profile, the request→chat→project handoff, the bilateral project proposal, and the 12-stage guided flow are well-built, thoughtfully gated, and pleasant to use. The completion→profile-population loop works correctly.

But there are **real issues to fix before launch**, one of them high-severity:

| # | Severity | Issue |
|---|----------|-------|
| 1 | **HIGH (security)** | Any creator can **self-award the "Verified creator" badge** via a single PostgREST call. Proven live. |
| 2 | Medium | The public "verified" badge reads a **legacy column disconnected from the real verification pipeline** — even a legitimately verified creator won't get the badge. |
| 3 | Medium (product) | **YouTube data never populates** at signup for a YouTube-first creator — the platform they're known for shows nothing. |
| 4 | Medium (UX/trust) | Business signup promises "reviewed by our team… dashboard access once approved," but the account gets **immediate full dashboard access** while `approval_status='pending_review'`. Inconsistent gating + misleading copy. |
| 5 | Low | Duplicate/overlapping budget option in business signup (`₹50K – ₹1L` vs `₹50K – ₹100K`). |
| 6 | Low | Password "too long (>72 chars)" only validated at final submit, not at the step where it's entered. |
| 7 | Low/Info | Pricing tiers cap at "₹25,000+", which badly undersells top creators; "Work With Me" packages fall back to **fabricated packages/pricing** when a creator hasn't configured them. |
| 8 | Low | Minor chat polish: left conversation-list preview stale ("No messages yet" after a message); Enter doesn't send (needs Send button). |

Detail and reproduction for each below.

---

## What was verified LIVE (end to end)

### 1. Creator signup — ✅ excellent
- 5-step wizard: Connect IG → Account → Profile → Creator positioning → Collab preferences.
- **Live Instagram autofill genuinely works.** Entering `madangowri` called `/api/auth/scrape-instagram` and pulled the real name, bio, avatar, and **2,832,508 followers** via Apify. This is a standout feature.
- Edge cases handled correctly:
  - Non-existent handle (`zzz_not_a_real_handle…`) → `404` → clean "Instagram profile not found." (Note: the failing call takes ~25s to time out — a faster fail or a visible timeout hint would help.)
  - Empty handle + "Auto-fill" → safe no-op.
  - Username live-sanitised (`Madan Gowri!!` → `madangowri`) with real-time availability check.
  - Reserved usernames (`admin`) → "This username is reserved."
  - Invalid email / weak password → inline errors, submission blocked.
- Account created and auto–signed-in (no email-confirmation wall in dev). Landed on a clean creator dashboard with sensible empty states.

### 2. Public profile — ✅ impressive
`/c/madangowri` renders with real scraped data: avatar, **12 real Instagram posts (deep-linked to the actual IG post URLs)**, 2.8M followers, 8.1% engagement, 1.4M avg views. The business email in the bio was correctly **stripped (PII)**. Copy-link / WhatsApp / LinkedIn share all present.

### 3. Business signup — ✅ works (with issues #4–#6)
4-step wizard (Account → Company → Verify/address → Intent). GST optional. Landed straight on the "Brand Partner Portal" dashboard.

### 4. Request → messaging handoff — ✅ excellent
- Server-side validation is solid: empty title blocked; **non-numeric budget rejected server-side** ("Budget must be a positive number").
- The **review gate correctly hard-blocks sending a request** while the business is unapproved ("account is still under review…") — see #4 for the inconsistency.
- After admin approval, the request sent; creator saw it under "WAITING ON YOU" with Accept/Decline.
- **Accepting routes straight into `/dashboard/messages`** with the toast *"Accepted — talk it through, then create the project together."* This correctly implements *accept ≠ project*. A "THE DEAL · In discussion" card carries the deal context (title, opening budget ₹1,50,000) with a **Create project** button. Live Stream chat works (message sent and received).

### 5. Project proposal → bilateral accept — ✅ excellent
- Creator's "Create project" opens an inline **PROPOSED TERMS** form (total budget, advance, due date, note) with the copy *"These go to the other side for approval — the project starts once they accept."*
- Proposal sent → "Terms awaiting approval," creator sees "Waiting on Priya Sharma to accept" + **Withdraw**.
- Business sees the terms with **"Accept & start project" / "Decline & keep talking."** Accepting flipped the deal to "Project ongoing," created the campaign project (₹2,00,000), and showed it under ACTIVE PROJECTS. **Bilateral consent is real.**

### 6. 12-stage guided flow — ✅ strong design, verified through stage 3
The project detail has **Guided / Board / Activity / Flow** views. The Guided view is well done:
- 12 stages: Started → Discussion → Deposit → Planning → Approved → Shooting → Editing → Review → Revisions → Final OK → Payment → Completed.
- Per-stage **role-specific instructions** (YOU (BRAND) vs PARTNER (CREATOR)), a per-stage **required checklist**, an **Updates** feed for sharing work/links/files, "Propose a change to the terms," and "This stage isn't needed — propose skipping it."
- **Bilateral sign-off is enforced:** the "Confirm this stage" button stays disabled until required checklist items are done, and after one side confirms it shows *"Waiting on the Creator to confirm. The project advances once they do."*
- Driven **live through the real API**: stages advanced `collaboration_started → project_discussion → advance_payment` via genuine mutual sign-off (auto-advance on both-signed).

### 7. Payment gate — ✅ well-designed control (blocks further live progress here)
Advancing past **advance_payment** is correctly gated: with Razorpay configured, the "Advance / deposit received" checklist item **cannot be hand-ticked** (returns 403 — *"opens only once the payment is confirmed"*). It requires a real `project_payments` row with `status='paid'`, set only by the signed Razorpay webhook. This closes the "mark paid without paying" bypass. Because the dev `RAZORPAY_WEBHOOK_SECRET` is a placeholder, the flow can't cross this stage here without a real Razorpay test payment — **that's a feature, not a bug**, but it's why completion wasn't driven live on the new project.

### 8. Completion → profile population — ✅ verified (via the existing completed project + RPCs)
Using the one pre-existing completed project (`Product-Launch`, creator `vimal2123` × business `JV-Systems`):
- **Creator's public profile populates:** `/c/vimal2123` renders **"Past collaborations: JV-Systems"** live. Driven by `get_creator_collaborations`, which returns brand names from `status='completed'` projects.
- **Reviews populate directionally:** `get_public_reviews` correctly keys off `to_user_id` + completed status. The existing 5★ review is a *creator→business* review, so it shows on the business's rating (count 1, avg 5) and correctly does **not** appear on the creator's profile. Takeaway: for a creator's "Brand ratings" to fill, the **business must review the creator** — worth making sure both-sides review is prompted at completion.
- Business dashboard has a COMPLETED tile fed by completed projects.

---

## Detailed findings

### #1 — HIGH: Creators can self-award the "Verified" badge  (proven live)
**What:** The public "Verified creator" badge is driven by `influencer_profiles.is_verified` (confirmed in the live `get_public_influencer` RPC: `'isVerified', coalesce(v_ip.is_verified, false)`). The `influencer_profiles` table has:
- A table-wide `UPDATE` grant to `authenticated` (and `anon`), never revoked — unlike `profiles`, which was locked down in migration 048.
- An RLS UPDATE policy `influencer_profiles_update_own` = `USING (auth.uid() = user_id)` with **no `WITH CHECK` and no column restriction**.

So any signed-in creator can `PATCH` their own `is_verified` to `true` via PostgREST.

**Proven live:** signed in as the test creator (a normal user, no admin powers) and ran a plain `supabase.from('influencer_profiles').update({ is_verified: true })` → succeeded → the public profile `/c/madangowri` then displayed **"VERIFIED CREATOR."** (Reverted afterward.)

**Impact:** The trust badge — the entire point of the verification system — is forgeable. A fake/impersonating creator can look verified to brands.

**Fix:**
1. `REVOKE UPDATE ON influencer_profiles FROM authenticated, anon;` then re-`GRANT UPDATE (col, col, …)` on only the user-editable columns (exclude `is_verified`), mirroring how `profiles` was hardened.
2. Add a `WITH CHECK` to the UPDATE policy.
3. Point `get_public_influencer.isVerified` at the real pipeline column (see #2) and have only `admin_decide_verification()` / `submit_verification()` write the badge.

### #2 — MEDIUM: Verified badge reads a dead column
The real verification pipeline (migrations 055/058, `/api/verification`, `submit_verification`, `admin_decide_verification`) writes `profiles.verification_status` / `profiles.verified_badge`. But the public RPC reads the **legacy** `influencer_profiles.is_verified`, which the live pipeline never updates. Net effect: a creator who completes the full HikerAPI ownership verification and reaches `verification_status='verified'` **still won't get the public badge**. (Observed: the test creator finished signup with `verification_status='in_review'` and would never flip the public badge through the intended path.) Fix folds into #1.3.

### #3 — MEDIUM: YouTube data never populates at signup
For a creator whose primary platform is YouTube (Madan Gowri, ~8.85M subs), the signup + verification path stored `youtube_handle='madangowri'` but produced **`youtube_subscribers=0` and no YouTube snapshot** — so the public profile's "Latest videos" section is absent and the platform the creator is famous for shows nothing. The code path exists (`/api/verification` and `/api/profile/refresh` both call `refreshYouTubeSnapshot`), but it silently yields nothing — consistent with the known consent-wall issue (YouTube's channel page blocks datacenter/server IPs when resolving the channel ID / subscriber count). Instagram (via Apify) works end to end; YouTube is the gap. Recommend: a resilient channel-ID resolution path (or store the channel ID at signup), plus a visible "couldn't fetch YouTube yet — retry" state instead of silent emptiness.

### #4 — MEDIUM: Business review-gate is inconsistent + misleading copy
`approval_status='pending_review'` after signup, yet the business gets **immediate full dashboard access** (Insights, Projects, Messages, Public profile). The *outbound* action — sending a collaboration request — **is** correctly hard-gated ("account is still under review"). So the substance is protected, but:
- The signup copy "You'll get dashboard access once approved" is **false** (access is immediate).
- The block is only revealed **after** the user fills out the entire request form — surface it up front (e.g. disable "Work with me" / show a banner) instead.

### #5 — LOW: Duplicate budget option
Business signup step 4 lists both **"₹50K – ₹1L"** and **"₹50K – ₹100K"** — the same range twice (₹1L = ₹100K). Remove one.

### #6 — LOW: Password-length error surfaces too late
An over-72-char password (bcrypt's limit) is only rejected at the final "Submit for review" step, after all 4 steps — validate at step 1 where the password is entered.

### #7 — LOW/INFO: Pricing ceiling & fabricated packages
- The highest price tier in creator signup is **"₹25K+"**, far too low for large creators (real integrations run into lakhs). Consider higher tiers or a free-form rate.
- When a creator hasn't configured "Work With Me" packages, the public profile **fabricates a default 3-package set with placeholder pricing** (`creator-profile.ts`), unlike the media-kit which correctly hides the section. A brand could see packages/prices the creator never set. Make the public profile hide the section too (or clearly mark it a template).

### #8 — LOW: Chat polish
- After sending a message, the left conversation-list preview still said "No messages yet" (stale until refresh).
- **Enter** does not send in the message box — you must click the Send button. If intentional (multiline), consider Enter-to-send with Shift+Enter for newline, which is the common expectation.

---

## Notes on empty new-profile state (from code review)
A brand-new creator's public profile looks strong up top (hero, About, What-I-create, packages all populate from the thorough signup wizard), but the lower sections — Featured content, Latest videos, Brand ratings, Audience insights, Past collaborations — **silently disappear when empty, with no empty-state copy or "connect / complete your first project" nudge**, even for the owner previewing their own page. Consider owner-only prompts so a new creator understands why sections are missing (especially when the IG/YouTube scrape hasn't landed).

## Environment blockers (not code bugs — need you/infra)
- **Payment stages** need real Razorpay test payments + a configured webhook secret (`RAZORPAY_WEBHOOK_SECRET` is a placeholder) to cross advance_payment/final_payment. Set this up to test the full money flow and completion end to end.
- **Business approval** is a manual admin step. During this run the business was approved by you before I continued.

## Test data created (safe to purge)
- Creator `madangowri` (`testcreator_2607@influnet.com`), Business "Zestly Foods Pvt Ltd" (`testbrand_2607@influnet.com`), one collab request, and campaign project **id 55** (currently at `advance_payment`, stage 3/12). All match the `scripts/purge-test-data.mjs` patterns (`testcreator_*` / `testbrand_*@influnet.com`) and can be removed with that script.

## Suggested priority order
1. **Fix #1 (self-verifiable badge)** — security, do first; small migration.
2. **Fix #2** (wire badge to the real pipeline) — folds into #1.
3. **Fix #3 (YouTube population)** and **#4 (review-gate copy/UX)** — creator-facing credibility & brand trust.
4. Clean up #5–#8 — quick wins.
5. Configure Razorpay test webhooks so the money + completion flow can be exercised end to end.
