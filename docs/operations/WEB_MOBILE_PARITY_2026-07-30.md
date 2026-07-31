# Web ↔ Mobile Feature Parity (2026-07-30)

**Question:** the web app is the complete one. Is everything in it also in the mobile app?

**Answer: it was close, with two real holes in the core money-making loop and five smaller gaps. Five are now fixed. Two need your decision because they require new native dependencies.**

## Method

Not a hand-wave comparison. Three passes:
1. Route inventory — every `page.tsx` in `apps/web/src/app` vs every screen in `apps/mobile/app`.
2. API inventory — every route in `apps/web/src/app/api` vs `packages/api/src/endpoints.ts` (the shared client both apps use).
3. **Call-site check** — which shared endpoints mobile *actually calls*, not just which it could. This is where the real gaps were: the endpoints existed and were typed, they were simply never wired to a screen.

That third pass is what a route-level comparison misses. `createProjectPayment`, `updateDeal`, `signUpload` and others were all sitting in the shared package, fully typed, called by nobody.

---

## Fixed in this pass

### 1. Propose project terms — was the biggest hole
A business on mobile could send a collab request and chat, but **could not turn an agreed conversation into a project.** `updateDeal` (POST `/api/conversations/[id]/deal`) was never called; mobile could only *respond* to terms the other side proposed from web. So two mobile-only users could talk forever and never start work.

Added a "Propose project terms" sheet to the conversation screen — title, scope, budget, advance — gated on the same `viewer.can_propose` the web deal panel uses. Budget parsing keeps the minus sign so `-500` is rejected rather than silently becoming `500` (the same bug fixed on web's request form earlier).

**File:** `apps/mobile/app/conversations/[id].tsx`

### 2. Forgot password — no path at all
Mobile's login screen had no forgot-password link. A locked-out user's only option was to find the website themselves.

Added `apps/mobile/app/(auth)/forgot-password.tsx`. The email's link deliberately lands on the **web** reset page rather than deep-linking into the app: completing a reset needs the recovery token exchanged for a session, which the web page already does correctly. Reimplementing that plus universal-link setup on both platforms — for a flow a user hits once — would be a lot of surface area to get wrong. Also doesn't disclose whether an account exists.

### 3. Post stage updates
Mobile could *read* the per-stage update thread but not post to it (`createStageEntry` unused). A creator had to fall back to chat, which loses the link to the stage the work belongs to.

Added a composer (message + optional link) to the stage screen, hidden on non-active projects so frozen records stay read-only. Bare hosts are normalised to `https://` rather than bounced by the route's URL validation.

**File:** `apps/mobile/app/projects/[id]/stage/[stage].tsx`

### 4. Project activity timeline
Web has an Activity tab per project — the audit trail of who did what when. Mobile had nothing (`projectActivity` unused). Added it as a card on the project detail screen, fetched separately so a failed trail costs one card rather than the screen.

**File:** `apps/mobile/app/projects/[id]/index.tsx`

### 5. Profile verification status
Mobile's verification screen only had the **bio-code ownership** flow. The separate **trust/metrics pipeline** (`/api/verification` — live follower/activity signals via Apify, plus human review) was invisible: a creator whose verification came back `needs_more_info` or `rejected` had no way to learn that, see why, or re-run it, without opening the web app.

Added a "Profile verification" card showing status, the reviewer's reason, and a re-run button.

**File:** `apps/mobile/app/verification.tsx`

---

## Needs your decision — new native dependency required

I stopped short of these two rather than adding native dependencies unilaterally. Both are real gaps; neither is safe to bolt on without a build cycle, and this app has a documented history of native-dependency crashes (the RNReanimated/RNWorklets launch crash, fixed via `buildFromSource`).

### A. In-app payments on mobile — the second big hole
Web has a full `PaymentGate` with Razorpay Checkout. **Mobile has no payment UI at all** — payment stages are manual/off-platform only, and `createProjectPayment` / `listProjectPayments` are never called. A business managing a project from their phone cannot pay through the app.

**What it needs:** Razorpay has no React Native SDK in this project. Realistic options:
- `react-native-webview` hosting Razorpay Checkout (most common approach; one new native dep)
- `react-native-razorpay` (official-ish wrapper; heavier, less maintained)
- Or: deliberately keep payments web-only and have mobile deep-link to the web project page for the payment step

**My recommendation:** the third option for now — a "Pay on web" button that opens the project's web URL. It's honest, needs no native dep, and can ship immediately. Full in-app checkout is a proper piece of work with a build/test cycle, better done deliberately than squeezed in.

### B. Image upload on mobile
Web can change avatar and cover image (Cloudinary via `signUpload`). **Mobile has no image upload anywhere** — `signUpload` is never called, and there's no image picker dependency installed. A creator who signs up on mobile cannot set a profile picture at all.

**What it needs:** `expo-image-picker` (a well-supported Expo module, low risk — but still a native dep requiring a new build, so it won't reach existing installed builds via an OTA update).

**My recommendation:** do it, but as its own change with a build. It's a visible gap for creators — a profile with no photo is a weak profile — and `expo-image-picker` is about as safe as native deps get.

Note the portfolio *does* work on mobile — it's link-based and the server derives thumbnails, so it needs no picker.

---

## Deliberately web-only (not gaps)

These are intentional, and the code says so in comments:

| Feature | Why |
|---|---|
| Admin panel (4 screens) | Mobile settings explicitly says "Admin tools are on the web — approvals, user management and reports are dense, desk-shaped work." |
| Media kit page | Mobile profile says pricing packages and the media kit "live only" on web; the creator profile screen links out. |
| Business public profile (`/b/[username]`) | No mobile equivalent; it's a brand-facing page reached by URL. |
| Kanban card board (`/projects/[id]/cards`) | Drag-and-drop board; the mobile equivalent is the guided stage flow, which is arguably better on a phone. |
| Discover | Disabled product-wide for V1 (returns 404 on web too). |

## Mobile-only (mobile is ahead here)

- Dedicated **notifications** screen (web has a bell dropdown)
- Dedicated **search** screen (web has a command palette)
- **Blocked accounts** screen (web only got a Settings panel earlier today)
- **Pending-approval gate** screen — a hard full-screen block for unapproved businesses, stronger than web's dismissible banner
- The ownership bio-code flow is genuinely better on mobile: copy code → tap into the Instagram app → come back → confirm

---

## Verification

```
apps/mobile  typecheck    clean
apps/mobile  expo export  clean — iOS (3823 modules) and Android (3920 modules)
```

Expo Router's generated route types (`.expo/types/router.d.ts`) were stale and had to be regenerated for the new `forgot-password` route to typecheck — worth knowing if you add a screen and get a bogus "not assignable to parameter of type" error on `router.push`.

**Not device-tested.** These are five new UI surfaces; they typecheck and bundle, and each reuses the existing `Sheet`/`Field`/`Card`/`Badge` primitives already used by adjacent code in the same files, but I have not run them in a simulator or on a device. That's the honest state — say the word and I'll do a simulator pass.

---

## What I'd suggest you do

1. **Decide on payments (A)** — my recommendation is the deep-link-to-web stopgap now, real in-app checkout as its own project. This is the one remaining hole in the core loop on mobile.
2. **Approve `expo-image-picker` (B)** — small, safe, and fixes creators having no profile photo on mobile.
3. Both A and B need a **new native build** to reach testers; neither ships via OTA update. Worth batching them with the production-backend fix already flagged in the [tester readiness report](TESTER_READINESS_CONFIDENCE_REPORT_2026-07-30.md).
4. Optionally: ask me for a **simulator pass** on the five new screens before they go to testers.
