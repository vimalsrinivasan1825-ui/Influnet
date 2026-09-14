# Access inventory

**Status: TEMPLATE. Not yet filled in — and that is currently the single
biggest bus-factor risk on this project.**

Every account below exists and someone is paying for it, but the list of what
exists, who owns it, and how to get in lives only in the founder's head. If
that becomes unavailable for a fortnight, the app keeps serving traffic and
nobody can deploy, rotate a key, or answer a customer.

Filling this in is a ~40-minute job that only the founder can do. It does not
require a developer.

> **Do not put secrets in this file.** It records *where* a credential lives
> and *who can reach it*, never the value. Values belong in a password
> manager. A repo file is the wrong place and this one is committed.

---

## How to use it

Work down the list with the password manager open. For each row: confirm the
account exists, confirm who the owner-of-record is, note which vault entry
holds the credential, and note whether losing it is recoverable.

"Recoverable?" is the column that matters most. A GitHub secret, for example,
is **write-only forever** — nobody can read it back out, so "we can look it
up later" is false for every one of them.

---

## Infrastructure

| Service | What it holds | Owner of record | Where the credential lives | Recoverable if lost? |
|---|---|---|---|---|
| **Azure** | Container Apps (dev, staging), ACR, resource group `influnet-rg` | | | |
| **GitHub** | The repo, all Environments and their secrets | | | Secrets are write-only — **no** |
| **Supabase — dev** | `jaajosocopoicmqcffuu` | | | |
| **Supabase — staging** | `aokdansyqxracuwsosji` | | | |
| **Supabase — production** | *Does not exist yet (HANDOVER P0.2)* | | | |
| **Domain / DNS** | `influnet.io` and subdomains | | | |

## Vendors

| Service | What breaks without it | Owner of record | Where the credential lives | Plan / billing |
|---|---|---|---|---|
| **Razorpay** | Payments | | | |
| **Stream** | Chat | | | |
| **Cloudinary** | Image uploads | | | |
| **Resend** | All email | | | |
| **Apify** | Instagram data | | | Free tier limits third-party actors |
| **2Factor** | Phone OTP | | | India-only |
| **Sentry** | Error reporting | | | |
| **PostHog** | Product analytics | | | |
| **Expo / EAS** | Mobile builds and updates | | | |
| **Apple Developer** | iOS distribution | | | Renews annually — **diarise it** |
| **Google Play** | Android distribution | | | |
| **UptimeRobot** | Knowing the site is down | | | |

## The people

| Role | Who | Has access to | Should they still? |
|---|---|---|---|
| Founder | | Everything | |
| Developer(s) | | | |
| Admin accounts in-app | | `/dashboard/admin` | Review quarterly |

---

## Renewal calendar

Things that expire silently and take something down with them.

| What | Expires | Consequence |
|---|---|---|
| Apple Developer membership | Annual | iOS builds stop; existing installs keep working |
| iOS distribution certificate | Annual | Builds fail signing — this already happened 2026-09-01 |
| Domain registration | | Everything |
| TLS certificates | Auto via Azure | Usually fine; note the renewal path anyway |

---

## Rotation

Do this **at handover, not before** — rotating early means rotating twice, and
every rotation is a chance to break a deploy.

Order matters. Rotate, deploy, verify, then move on:

1. `SUPABASE_SERVICE_ROLE_KEY` — deploy immediately after; the app cannot boot without it.
2. `STREAM_API_SECRET` — chat breaks until deployed.
3. `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` — **rotate the webhook secret in Razorpay's dashboard and the environment in the same sitting**, or captures stop opening gates silently.
4. `RESEND_API_KEY`
5. `APIFY_TOKEN`
6. `SUPABASE_ACCESS_TOKEN`
7. GitHub PATs and the Azure service principal.

After each: deploy, then `/dashboard/admin/health` to confirm the integration
still reports as configured.
