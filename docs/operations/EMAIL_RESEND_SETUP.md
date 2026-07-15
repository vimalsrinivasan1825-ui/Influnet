# Email delivery with Resend

Influnet sends two kinds of email. They are set up separately.

| Kind | Examples | Who sends it today | How Resend plugs in |
| --- | --- | --- | --- |
| **Auth email** | Signup confirmation ("Check your email"), password reset, magic link | Supabase Auth (default shared sender — low deliverability, rate-limited) | Point Supabase Auth at Resend via **custom SMTP** |
| **App / transactional email** | Collab request received, request accepted, project updates | Nothing yet — env vars exist (`RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAILS_ENABLED`) but no send code is wired | Call the Resend API from the app (needs a small code addition) |

The signup flow you're testing is **auth email**. Fixing deliverability there = configuring Resend SMTP in Supabase (Part 2 below). No app code change is required for that.

---

## Part 1 — One-time Resend account setup (your side)

1. Create a Resend account at https://resend.com.
2. **Add and verify your sending domain** (e.g. `influnet.com` or a subdomain like `mail.influnet.com`). Resend shows you DNS records to add:
   - **SPF** (a `TXT` record)
   - **DKIM** (one or more `CNAME`/`TXT` records)
   - Optionally **DMARC** (a `TXT` record — recommended)
   Add these at your domain registrar / DNS provider. Verification usually completes within minutes to a few hours.
   > A verified domain is required for production. Without it you can only send from `onboarding@resend.dev` to your own address — fine for a quick test, not for real users.
3. Create an **API key** (Resend dashboard → API Keys). Copy it once — it's shown only once.

### What I need from you after this
- ✅ Verified sending domain (or the subdomain you chose)
- ✅ The **From address** you want, e.g. `Influnet <noreply@influnet.com>` — it must be on the verified domain
- ✅ The **Resend API key** — **do not paste it into chat.** Put it directly into the env files / hosting secrets yourself (see below). I'll wire up everything that consumes it.

---

## Part 2 — Auth emails via Supabase custom SMTP (fixes signup confirmation)

Resend exposes SMTP credentials you drop into Supabase. This makes signup-confirmation and password-reset emails come from your domain with good deliverability.

In **Resend → Settings → SMTP**, you'll get:
- Host: `smtp.resend.com`
- Port: `465` (SSL) or `587` (TLS)
- Username: `resend`
- Password: **your Resend API key**

Then in the **Supabase dashboard → Project → Authentication → Emails → SMTP Settings**:
1. Enable **Custom SMTP**.
2. Fill in the host/port/username/password above.
3. Set **Sender email** = your verified From address, **Sender name** = `Influnet`.
4. Save, then send yourself a test signup to confirm delivery.

> This is a dashboard configuration — you do it directly in Supabase. I can't (and shouldn't) enter the API key for you. Once it's set, the signup flow's "Check your email to confirm" step will deliver reliably.

While you're in **Authentication → URL Configuration**, also set:
- **Site URL** = your production URL (e.g. `https://influnet.com`)
- **Redirect URLs** = allow `https://influnet.com/**` (and your Vercel preview domain) so confirmation/reset links land back in the app.

---

## Part 3 — App transactional emails (optional, needs code)

The env scaffolding exists but no send code does. When you want collab/project notifications delivered, I'll add a small `lib/email.ts` helper that POSTs to the Resend API (`https://api.resend.com/emails`) using `RESEND_API_KEY` + `EMAIL_FROM`, gated by `NOTIFY_EMAILS_ENABLED`, and call it from the notification points. Say the word and I'll build it.

### Env vars (set in each environment's secrets — never commit real values)
```
RESEND_API_KEY=re_...           # from Resend; set in Vercel/host secrets, not in git
EMAIL_FROM=Influnet <noreply@influnet.com>
NOTIFY_EMAILS_ENABLED=true      # "false" suppresses all app sends (default in dev)
NEXT_PUBLIC_APP_URL=https://influnet.com
```

---

## Quick checklist for you

- [ ] Resend account created
- [ ] Domain added + SPF/DKIM (+DMARC) DNS records verified
- [ ] From address chosen (on the verified domain)
- [ ] API key created and stored in your host's secrets (not in chat, not in git)
- [ ] Supabase custom SMTP configured with Resend (Part 2)
- [ ] Supabase Site URL + Redirect URLs set
- [ ] (Later) Tell me to wire Part 3 app-notification sends
