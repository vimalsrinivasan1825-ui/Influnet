# Free and Pro — what each plan can do

Status: **built, switched off.** `SUBSCRIPTIONS_ENABLED=false` everywhere, so
today every account behaves exactly as it did before plans existed. Nothing in
this document is live until that flag is turned on.

Price: **₹999 for 30 days.** Stored as `99900` paise in `billing_settings`, not
in code.

---

## The short version

**Brands pay. Creators do not pay to earn.**

Influnet is two-sided: brands have a budget line for creator spend, creators do
not. The moment a creator has to pay to receive a request, accept a deal, or get
paid, supply thins out — and supply is the thing brands are paying for. So every
creator capability on the earning path is free forever, at any volume.

Creator Pro exists, but it sells *visibility* (placement, media kit, analytics),
never *access*.

---

## Never gated, at any tier, in any billing state

These carry no entitlement check anywhere in the codebase, by construction. If a
lapsed card could switch one of them off, a billing failure would become a
safety incident, and an expired mandate could strand money mid-project.

| Capability | Why it can never be gated |
|---|---|
| Bilateral stage sign-off | Blocking it freezes the *other* party's project too |
| Both payment gates (`advance_payment`, `final_payment`) | Money in flight must not depend on subscription state |
| Blocking and reporting | Safety controls behind a paywall is a trust-and-safety failure |
| Cancellation and disputes | A user who cannot exit is a chargeback |
| Ownership verification | It is the anti-impersonation spine; gating it inverts the signal |
| Notifications about your own projects | Silence on a deadline is a broken product, not an upsell |
| Export of your own data | Withholding a user's own records to force payment is hostage-taking |

The rule behind the table: gate **breadth** (how many, how far back, how many
others you can see) and **depth** (how much detail about someone else). Never
gate **completion** — finishing something already started.

---

## Brands

| Capability | Free | Pro |
|---|---|---|
| Concurrent active projects | **2** | Unlimited |
| Collab requests sent | **10 / month** | Unlimited |
| Creator lookup by username or Instagram handle | ✅ | ✅ |
| Browse/filter by niche, industry, location | ❌ | ✅ |
| Profile: name, headline, followers, verified badge | ✅ | ✅ |
| Profile: portfolio, past collaborations, ratings | ✅ | ✅ |
| Profile: audience demographics (location, age, gender, interests) | ❌ | ✅ |
| Profile: creator's contact details from their bio | ❌ | ✅ |
| Profile: published rate card | ❌ | ✅ |
| Media kit export | ❌ | ✅ |
| Analytics history | 30 days | Full + export |
| Gold verified badge | ❌ | ✅ |
| Everything in the "never gated" table | ✅ | ✅ |

### Why 2 concurrent and not 5 lifetime

A lifetime cap punishes long-tenured good users and produces a "delete something
to continue" moment that reads as a bug. A concurrent cap is cleared by the
user's own success — finish a campaign, get a slot back — and the wall arrives
while they are actively winning, which is when upgrading makes sense to them.

### What a Free brand loses that they had before

Only one thing: **query-less browsing.** Looking up a creator by username or
Instagram handle was always the primary path and stays free. Filtering by niche
or location *without* naming anyone becomes Pro.

---

## Creators

| Capability | Free | Creator Pro |
|---|---|---|
| Receive requests, negotiate, run projects, get paid | ✅ **unlimited, forever** | ✅ |
| Public profile and portfolio | ✅ | ✅ |
| Own analytics | 30 days | Full + export |
| Media kit | Basic | Custom URL, own branding, PDF |
| Search placement | Standard | Boosted |
| Gold verified badge | ❌ | ✅ |

A creator always sees **their own** profile in full, including their own
audience data. Charging the supply side to look at itself is the one thing a
two-sided marketplace must not do.

---

## The gold badge

A Pro subscriber's verified badge renders gold with a soft glow instead of the
usual pink. Two rules it follows:

- **Pro never creates a verification mark.** An unverified Pro account gets no
  badge at all. Verification is a claim Influnet has checked; Pro is a purchase.
  Letting money produce a verification mark would make the badge mean "paid"
  instead of "confirmed" — the exact failure migration 083 was written to close,
  when creators could award themselves `is_verified`.
- **It does not exist when plans are off.** A gold badge in a deployment with no
  paid tier advertises a product nobody can buy.

Plan status is public for badge purposes and *only* for badge purposes:
`is_pro_public(uuid)` returns one boolean. `current_tier(uuid)` is **not**
callable by `authenticated`, so nobody can walk the user table asking who pays.

---

## How enforcement works

Four layers. Only three are enforcement.

1. **The client** — locks, badges, upsell copy. **Not a gate.** A signed-in user
   owns their session; assume everything here is editable. It decides what a
   button looks like, never what happens when pressed.
2. **The API route** — `requireFeature()` / `requireQuota()`, one call at the top
   of the handler, same shape as `enforceRateLimit()`. Refuses with **402** and a
   machine-readable body (`feature`, `tier`, `limit`, `used`, `upgradeUrl`).
3. **The database function** — `get_entitlements()`, `consume_quota()`,
   `current_tier()`. `SECURITY DEFINER`, so web and mobile cannot disagree.
4. **RLS** — `subscriptions` is readable only by its owner and writable by
   nobody. Every write comes from the signed Razorpay webhook via the service
   role.

### Redaction happens where data is fetched, not where it is rendered

The single most common way a paywall leaks is returning the full object and
hiding it in the client. `lib/public-profile/tier-projection.ts` builds the Free
view from an **allow-list**, so a field added to the view model later is absent
from the Free response until a human classifies it. A deny-list would ship every
new field to Free by default.

### Entitlements fail CLOSED

`lib/rate-limit.ts` fails *open* and says why: a limiter is an abuse guard, not
an auth control. This is the opposite. If the subscription store cannot be read,
the caller is treated as **Free**.

A paying brand briefly losing Pro is a support ticket. A free account silently
gaining it is an unbounded leak nobody would notice. A 60-second cache keeps
that trade cheap: a blip downgrades nobody, a cancellation still lands within a
minute.

### Quota checks are atomic

`consume_quota()` increments and tests in one statement; the project cap is a
`BEFORE INSERT` trigger on `campaign_projects` behind a transaction-scoped
advisory lock. Counting rows, comparing, then inserting is a check-then-act race
— two acceptances in the same instant would both pass on the last free slot.
This repo already paid for that lesson once with `stage_progress` (migration 114).

### Downgrade behaviour

A brand with 9 active projects dropping to Free keeps all 9. Existing work is
never deleted, frozen or locked — some of it holds money in flight and a
counterparty who did nothing wrong. Only **creation** is blocked. Premium
*views* go dark immediately; that is a read, not their work.

---

## Turning it on

1. Set `SUBSCRIPTIONS_ENABLED=true` and make sure Razorpay is configured. The
   boot banner flags gates-on-with-no-way-to-pay.
2. Leave `billing_settings.db_enforcement_enabled = false` at first. The
   application layer enforces; the database trigger is a backstop, and switching
   it on adds an error shape the UI has not rendered before.
3. Point the Razorpay webhook at `/api/payments/webhook` — the **same** endpoint
   as project payments. Both kinds arrive there and are told apart by
   `notes.purpose`. A second URL would mean a deployment pointed at only one
   silently dropping the other.
4. Adjust the numbers in `billing_settings` — no deploy needed.

### Not yet done

- **Recurring billing.** ₹999 currently buys a fixed 30 days via Razorpay
  Orders, paid again when it lapses. UPI AutoPay / e-mandate is the right
  long-term rail for India and needs a Plan created in the dashboard. The schema
  already accepts it (`razorpay_subscription_id` is nullable, and
  `current_period_end` means the same under both models).
- **Mobile.** The gates are enforced server-side, so the mobile app is already
  subject to them, but it has no upgrade screen and no gold badge yet.
- **Creator Pro.** The table above describes it; only the brand-side gates are
  wired.
- **Analytics window and media-kit gates.** The feature keys exist
  (`analytics.full`, `profile.mediakit`); the call sites are not yet instrumented.

---

## Where the code is

| Piece | File |
|---|---|
| Schema, `current_tier`, quotas, trigger | `supabase/migrations/115_billing_foundation.sql` |
| Tier vocabulary (shared with mobile) | `packages/core/src/entitlements.ts` |
| Resolution and enforcement | `apps/web/src/lib/entitlements.ts` |
| Free profile projection (allow-list) | `apps/web/src/lib/public-profile/tier-projection.ts` |
| Purchase + webhook handling | `apps/web/src/lib/payments/subscription.ts` |
| Runtime config for clients | `apps/web/src/app/api/billing/entitlements/route.ts` |
| Upgrade UI | `apps/web/src/components/dashboard/upgrade-card.tsx` |
| Tests | `apps/web/tests/unit/entitlements.test.ts` |
