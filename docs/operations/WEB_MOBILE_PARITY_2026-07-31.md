# Web ↔ Mobile parity analysis — 2026-07-31

Scope: the signup flow in depth (the reported problem), plus a sweep of every
shared `/api/*` endpoint to find flows mobile cannot reach at all.

Method note: comparing *routes* between the two apps finds nothing useful — they
share one API. The signal is which shared endpoints mobile actually **calls**,
and which fields each wizard actually **sends**. See `web-mobile-parity-method`.

---

## 1. Signup — field-by-field

### Creator / influencer

| Field | Web | Mobile (before) | Mobile (now) |
|---|---|---|---|
| name | ✅ first + last | ✅ single field | ✅ |
| username + live check | ✅ | ✅ | ✅ |
| email, password | ✅ | ✅ | ✅ |
| **phone** | ✅ always | ❌ only when OTP gate on | ✅ always |
| phone OTP verification | ✅ | ✅ | ✅ |
| **gender** | ✅ required | ❌ missing | ✅ |
| **bio** | ✅ required | ❌ missing | ✅ |
| **youtubeHandle** | ✅ | ❌ missing | ✅ |
| **twitterHandle** | ✅ | ❌ missing | ✅ |
| instagramHandle | ✅ | ✅ | ✅ |
| niche | ✅ primary + secondary | ✅ flat list | ✅ |
| languages, collabTypes, priceRange | ✅ | ✅ | ✅ |
| city, state | ✅ | ✅ | ✅ |
| instagramFollowers (from prefill) | ✅ | ❌ | ❌ still open — see §3 |

### Business

| Field | Web | Mobile (before) | Mobile (now) |
|---|---|---|---|
| name, companyName | ✅ | ✅ | ✅ |
| email, password | ✅ | ✅ | ✅ |
| **phone** | ✅ always | ❌ only when gate on | ✅ always |
| industry, businessType | ✅ | ✅ | ✅ |
| website | ✅ validated + normalised | ⚠️ raw string | ✅ validated + normalised |
| **registeredAddress** | ✅ required | ❌ missing | ✅ required |
| **gstNumber** | ✅ optional, validated | ❌ missing | ✅ optional, validated |
| marketingBudget, collabPreferences | ✅ | ✅ | ✅ |
| city, state | ✅ | ⚠️ city not required | ✅ |

`registeredAddress` mattered most here: it is what the review team checks a
business against, and mobile signups were arriving without it.

### Signup mechanics (not fields)

| Behaviour | Web | Mobile (before) | Mobile (now) |
|---|---|---|---|
| Wizard answers stored as auth metadata | ✅ `options.data` | ❌ email/password only | ✅ (OTP token excluded) |
| `email` in register payload | ✅ | ❌ | ✅ |
| Verification kicked off after register | ✅ `POST /api/verification` | ❌ never started | ✅ |
| Username re-checked before creating auth user | ✅ | ❌ | ✅ |
| Username check fails **open** on network error | ✅ | ❌ hard-blocked signup | ✅ |
| Taken-username recovery with suggestions | ✅ | ❌ | ❌ open — §3 |
| Instagram prefill (name/bio/followers) | ✅ | ❌ | ❌ open — §3 |
| Email-confirmation replay of pending payload | ✅ localStorage | ❌ payload discarded | ❌ open — §3 |

The two ❌ that were actual defects rather than missing features:

- **Username check fail-closed.** A flaky check returned `error`, and mobile
  treated that as "not available", permanently blocking a handle that was free.
  Web had the same bug and fixed it; mobile's `use-signup.ts` even carries the
  comment about it while the wizard ignored the result.
- **Verification never started.** Every mobile signup skipped the trust-badge
  pipeline, so mobile-registered creators sat unverified until they happened to
  open the verification screen.

---

## 2. Flows mobile cannot reach at all

Endpoints in `packages/api` that mobile never calls:

| Endpoint | What it gates | Severity |
|---|---|---|
| `createProjectPayment` | Razorpay checkout. Mobile reads payment *stage status* but has no way to pay. A business on mobile must switch to web to move any paid project forward. | **High** |
| `createProject` | The `accept → negotiate → propose → start project` handoff. Mobile can operate an existing project but cannot propose one. | **High** |
| `createStageItem` | Adding deliverable items to a stage (web: project detail). Mobile can update and sign off items but not create them. | Medium |
| `scrapeInstagram` | Signup prefill + follower count at registration. | Low |
| `getConversation`, `dismissWelcome`, `health` | Single-conversation fetch (mobile uses Stream), welcome dismissal, healthcheck. | Cosmetic |

Everything else — deals, collabs, stage entries, change requests, reviews,
reports, blocks, portfolio, notifications, push tokens, verification,
ownership, discovery, profile — mobile calls.

---

## 3. Deliberately left open

Not defects; each needs a product decision or native work.

1. **Razorpay on mobile.** Needs either the React Native SDK (new native module,
   so a new binary — not OTA) or a WebView checkout handoff. Decide which before
   external testers use mobile for paid work.
2. **Project proposal from mobile.** Needs UI design for the propose/counter
   screen, not just an endpoint call.
3. **Instagram prefill at signup.** `scrapeInstagram` is one call; the question
   is whether mobile wants web's "connect first, then prefill" step-1 pattern.
4. **Email-confirmation replay.** If Supabase email confirmation is ever turned
   on, mobile silently discards the whole wizard payload
   (`use-signup.ts` → `needsConfirmation`). Web replays it from localStorage and
   handles the expired-OTP 403. Harmless while confirmation is off — a data-loss
   bug the moment it is on.
5. **Taken-username suggestions.** Mobile now jumps back to the handle step with
   an explanation; it does not offer generated alternatives.

---

## 4. Deployment gotcha found while testing

`NEXT_PUBLIC_PHONE_OTP_ENABLED` is read by `phoneOtpEnabled()` in
`apps/web/src/lib/phone-otp.ts`, which gates `/api/auth/config`,
`/api/phone-otp/*` and the register check.

Next.js freezes every `NEXT_PUBLIC_` value at `next build` — **including in
server code**, per `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`:
"After being built, your app will no longer respond to changes to these
environment variables."

So setting it on Railway only takes effect if the variable is present when the
image is **built**. A redeploy that reuses a cached build keeps the old value,
and `/api/auth/config` keeps answering `{"phoneOtpEnabled":false}` — which makes
mobile correctly hide the OTP step.

Verify with:

```bash
curl -s https://dev.influnet.io/api/auth/config
```

If a runtime-flippable gate is wanted later, the server helper would need to read
a non-public var (e.g. `PHONE_OTP_ENABLED`) **and** the web client would need to
read `/api/auth/config` like mobile does — changing only the server half would let
web render no OTP field while register demands a verified number, breaking web
signup.
