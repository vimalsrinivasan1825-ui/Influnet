# Admin-controlled runtime settings — feasibility report

**Question**: can email sending, OTP and similar switches be turned on and off
from the admin page, without a redeploy — and with a check so not just anyone
can flip them?

**Answer**: **Yes for most of them, and one useful piece already exists.** But
they split into three tiers with genuinely different difficulty, and there is
one category I'd argue *should not* be made toggleable at all. That last point
is the most important thing in this report.

Nothing has been built. This is for you to review first.

---

## Where things stand today

Every switch is an environment variable, so changing one means editing env and
redeploying. Here's the actual inventory, from the code:

| Switch | Read from | Controls |
|---|---|---|
| `NOTIFY_EMAILS_ENABLED` | server, per call | master email kill switch |
| `EMAIL_DISABLED_TEMPLATES` | server, per call | per-template kill switch |
| `EMAIL_DAILY_CAP` | server, **at module load** | per-user daily email cap |
| `EMAIL_ALLOWLIST` | server, per call | restrict recipients (staging) |
| `EMAIL_REQUIRE_VERIFIED` | server, per call | only mail verified addresses |
| `OWNERSHIP_GATE_ENABLED` | server, per call | Instagram-ownership gate |
| `ADMIN_REQUIRE_MFA` | server, per call | force 2FA on admin routes |
| `VERIFICATION_PROVIDER` | server, per call | which scraper to use |
| `NEXT_PUBLIC_PHONE_OTP_ENABLED` | **build-time inlined** | signup OTP gate |
| Supabase "Confirm email" | **not an app setting at all** | signup email verification |

Two things worth noticing straight away:

- **`EMAIL_DAILY_CAP` is read at module load** (`const DAILY_CAP = Number(...)`),
  so it's frozen for the life of the process even if the env changed. Anything
  moved to runtime flags has to be read *per call*, not at import.
- **You already have the right pattern**, and whoever wrote it had exactly this
  problem in mind. `GET /api/auth/config` serves `phoneOtpEnabled` as a runtime
  boolean to the mobile app, with this comment:

  > *"Web reads NEXT_PUBLIC_\* directly at build time, but a shipped binary
  > can't: if mobile baked the OTP flag in, every already-installed build would
  > start failing signup the moment the gate was switched on server-side."*

  That is the same argument for making web read flags at runtime. Half the
  architecture is already there.

---

## Tier 1 — Server-only flags: **easy, do this**

Everything in the table above except the last two.

These are already read inside functions on each request, so the only change is
*where the value comes from*: a database row instead of `process.env`. No client
involvement, no build step, no bundle. Flip in the admin page, effective within
the cache TTL.

**Effort**: roughly one migration, one library module, one admin API route, one
admin page. Call it 1–2 days including tests.

**How it would work**

```
platform_settings          (key, value jsonb, updated_by, updated_at)
platform_settings_audit    (key, old_value, new_value, actor, reason, at)
```

A `getSetting(key)` helper with a **short in-process cache** (30–60s) and a
**hard-coded fallback to the current env var**, so:

- if the database is unreachable, the flag falls back to env — the site does not
  lose its settings because one query failed;
- migration is safe: ship it with every flag reading the env default, then move
  them over one at a time.

**On caching**: the app runs serverless, so each instance caches independently
and a flip takes up to the TTL to reach every instance. That's fine for these
switches. Upstash Redis is already wired for rate limiting (though not currently
configured) and could give instant propagation later if it ever matters. It
doesn't yet — don't add it for this.

---

## Tier 2 — `NEXT_PUBLIC_PHONE_OTP_ENABLED`: **needs a small refactor first**

This one is a trap, and it's a known one in this codebase.

`NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**. The string is literally baked into the shipped file. Moving the value
into a database does nothing on its own — the browser is still running a bundle
with `true` or `false` compiled into it.

**The fix is small**, because the endpoint already exists: have the web signup
wizard read `GET /api/auth/config` at runtime — exactly as mobile already does —
instead of reading the inlined constant. Then one flag serves web, mobile and
server from one source.

The server-side gate in `/api/auth/register` is what actually enforces OTP
anyway (the UI only decides whether to *show* the step), so this is about
keeping the UI honest, not about security.

**Effort**: half a day on top of Tier 1.

---

## Tier 3 — Supabase "Confirm email": **possible, but I'd advise against it**

This is the one you most want to control, and it's the one I'd be most careful
with — because it isn't an app setting at all. It lives in Supabase Auth.

I verified the current state through the Management API:

```
mailer_autoconfirm: true      ← "Confirm email" is OFF
sms_autoconfirm:    true
```

It **can** be changed programmatically — `PATCH /v1/projects/{ref}/config/auth`
would do it. So technically, yes, an admin button could flip it.

**Here's why I'd think hard before building that.** It requires storing a
Supabase **Management API token** (`sbp_…`) in the app's environment. That token
is not scoped to auth settings. It is full control of the entire project: read
and write every table, bypass all RLS, change or drop the schema, rotate keys,
delete the project. Putting it into the web application's runtime means a single
server-side vulnerability escalates from "data exposure" to "total project
compromise" — and this is a public-facing app.

Weighed against what it buys: this is a setting you will flip perhaps **twice
ever** — once before launch, and possibly once in an incident.

**My recommendation**: leave it as a dashboard toggle, and instead surface it
*read-only* in the admin health page — "Email confirmation: OFF ⚠️", read via a
narrowly-scoped token or checked at deploy time. You get the visibility (which
is the real value) without the credential. If you later want the button, put it
in a separate internal tool that isn't reachable from the public app.

---

## The part you specifically asked about: who can flip a switch

"Not everyone can make these things" — agreed, and this deserves more than an
`is_admin()` check. There are 2 admin accounts today, so the blast radius of one
compromised admin is the whole platform.

I'd suggest layering these, in order of value-per-effort:

**1. Classify every flag by risk.** This is the highest-value idea in the
report. Not all switches deserve the same treatment:

- **Operational** (email kill switch, daily cap, template toggles, verification
  provider) — one admin, audit-logged. These exist to be flipped during an
  incident; making them slow defeats the point.
- **Security-relevant** (`OWNERSHIP_GATE_ENABLED`, `ADMIN_REQUIRE_MFA`, OTP) —
  require MFA, a written reason, and a second admin's approval.
- **Never toggleable** — see the warning section below.

**2. Require MFA to change a security-relevant flag.** `ADMIN_REQUIRE_MFA`
already exists in `lib/api.ts` and checks the JWT's `aal2` claim, so the
machinery is there. Even with the global setting off, the flag-write route can
demand `aal2` specifically.

**3. Require a reason, always.** A free-text reason stored with every change.
Cheap, and it is what makes the audit log worth reading six months later.

**4. Two-person rule for security flags.** One admin proposes, a *different*
admin approves, and it applies only then. `admin_audit_log` already has the
shape for this (`actor_id`, `action`, `target_type`, `metadata`). With only 2
admins this is workable — though note if one is unavailable you cannot change a
security flag, which is exactly the trade you're making.

**5. Auto-expiry on "off".** This is worth more than it sounds. Turning a
protection *off* should be temporary by default: a flag disabled at 2am during
an incident gets an expiry (say 24h) and turns itself back on. The failure mode
this prevents is the common one — a switch flipped during a crisis and quietly
forgotten for months.

**6. Re-authentication.** Ask for the password again at the moment of change,
so a walk-up on an unlocked laptop isn't enough.

I'd build 1, 2, 3 and 5 first. 4 and 6 are worth having but add friction; decide
once you have more than two admins.

---

## ⚠️ What must NOT go behind a runtime flag

This is the risk that comes with the feature, and it's the reason to design the
tiers deliberately rather than making everything toggleable.

**A settings table controllable from the web app becomes a way to disable
security controls with no code review, no deploy, and no CI trail.** Today,
weakening a payment gate requires a pull request someone can see. With a
careless flag system it becomes a checkbox.

So, concretely — these should stay in code, and not be flag-controlled:

- **Payment gates.** The bug fixed this morning let an unpaid project through
  the advance-payment gate. A `PAYMENTS_REQUIRED` flag would recreate that as a
  supported feature.
- **Bilateral consent rules** — dual sign-off, dual completion confirmation.
  These are the product's integrity guarantees, not preferences.
- **Webhook signature verification.** No circumstance justifies a switch.
- **RLS and authorization checks.** Never.

The rule I'd write down: *a flag may change **what the product does**; it may
never change **what the product guarantees**.* Email sending, OTP, scraper
choice and rate limits are behaviour. Payment enforcement and consent are
guarantees.

---

## Suggested build order

| # | Step | Effort |
|---|---|---|
| 1 | `platform_settings` + audit table, `getSetting()` with env fallback and TTL cache | 0.5d |
| 2 | Move the 8 server-only flags across, one at a time, defaults unchanged | 0.5d |
| 3 | `GET/PATCH /api/admin/settings` — MFA + reason required, everything audited | 0.5d |
| 4 | Admin page: grouped by risk tier, showing who changed what and when | 1d |
| 5 | Web signup reads `/api/auth/config` instead of the inlined constant | 0.5d |
| 6 | Auto-expiry for flags in the "off" state | 0.5d |
| 7 | Read-only Supabase auth-config status on the admin health page | 0.5d |
| — | Two-person approval for security flags | +1d, when you want it |

**Roughly 4 days for a solid version.** Steps 1–4 alone deliver most of the
value and could ship independently.

---

## Honest summary

**Yes, this is very doable, and it's a good idea** — particularly the email kill
switches, which are exactly the thing you want to reach during an incident
rather than waiting on a deploy.

Three caveats worth carrying into the decision:

1. **The OTP flag needs the web client to stop reading the build-time constant.**
   Small change, and the endpoint it needs already exists.
2. **The Supabase email-confirmation toggle is a different kind of thing.** It's
   achievable but costs you a full-project credential inside a public-facing
   app. I'd take the read-only status display instead and keep flipping it in
   the dashboard — it's a twice-ever action.
3. **The flag system is itself a security surface.** Built with tiers, MFA,
   reasons, audit and auto-expiry, it makes you safer. Built as "toggle
   anything", it's a way to turn protections off without leaving a trace. The
   difference is entirely in the design, which is why it's worth agreeing the
   classification before any code is written.

Happy to build it — say which tiers you want and whether you'd like the
two-person rule in from the start.
