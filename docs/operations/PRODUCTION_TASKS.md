# Influnet — Production Readiness Tasks

**Purpose:** Single-focus tasks you can complete one at a time. Each task is self-contained with clear steps, verification, and a checkbox. Complete one fully before starting the next.

**Current Status:** The app is in production with dev/staging environments ready. These tasks will make it truly production-ready and able to withstand years of use.

---

## How to Use This Document

1. Pick the next unchecked task
2. Complete ALL steps in that task
3. Verify the task works
4. Check the box and move to the next
5. Do NOT skip ahead — each task builds on the previous ones

---

## Phase 1: Infrastructure Safety (Do First)

### Task 1: Confirm Staging ≠ Production Database

**Why:** If staging and production share the same database, a staging mistake can destroy production data.

**Time:** 5 minutes

**Steps:**
1. Go to GitHub → Settings → Environments
2. Click on `staging` environment
3. Find `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
4. Click on `production` environment
5. Compare the values

**Verification:**
- [ ] The URLs are DIFFERENT (different project refs)
- [ ] The service-role keys are DIFFERENT

**If they match:** This is your #1 emergency fix — provision a separate production Supabase project (see Task 2).

**Completion:**
```
Date confirmed: _______________
Values are different: YES / NO (if NO, stop and do Task 2 first)
```

---

### Task 2: Provision Production Supabase Project

**Why:** Production needs its own isolated database with real users, real money, real data.

**Time:** 1-2 hours

**Prerequisites:** Task 1 completed (or confirmed they're the same)

**Steps:**

**2a. Create the project**
1. Go to https://supabase.com/dashboard
2. Create a NEW organization (separate from dev/staging org)
3. Create a new project in that organization
4. Note the project ref (e.g., `abcdefghijklmnop`)

**2b. Apply all migrations**
```bash
# Link to the new production project
supabase link --project-ref <PROD_REF>

# Apply all migrations (001 through 088)
supabase db push

# If any migration fails, STOP and capture the error
```

**2c. Deploy edge functions**
```bash
supabase functions deploy phone-otp --project-ref <PROD_REF>
supabase functions deploy auth-signup --project-ref <PROD_REF>
```

**2d. Verify storage buckets exist**
1. Go to Supabase Dashboard → Storage
2. Confirm these buckets exist:
   - [ ] `project-assets`
   - [ ] `avatars`
   - [ ] `profile-photos`
3. Check their public/policy settings match dev

**2e. Configure Auth**
1. Go to Auth → URL Configuration
2. Set **Site URL** to your production domain (e.g., `https://influnet.io`)
3. Add **Redirect URLs**: `https://influnet.io/**`
4. Go to Auth → Email Templates
5. Configure SMTP sender (see Task 8 for details)

**Verification:**
- [ ] `supabase db push` completed without errors
- [ ] All edge functions deployed
- [ ] Storage buckets exist with correct policies
- [ ] Auth Site URL set to production domain

**Completion:**
```
Production project ref: _______________
Migrations applied through: _______________
Date completed: _______________
```

---

### Task 3: Set Production Environment Variables

**Why:** The app needs the correct credentials to connect to production services.

**Time:** 30 minutes

**Prerequisites:** Task 2 completed

**Steps:**

**3a. Get credentials from Supabase**
1. Go to your production Supabase project
2. Settings → API
3. Copy:
   - Project URL (e.g., `https://abcdefghijklmnop.supabase.co`)
   - `anon` public key
   - `service_role` secret key (starts with `eyJ...`)

**3b. Get Stream credentials**
1. Go to https://dashboard.getstream.io
2. Select your app (or create one for production)
3. Copy:
   - API Key
   - API Secret

**3c. Set Railway variables**

Go to Railway → Your production service → Variables

**Build Variables** (these are inlined at build time):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-prod-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_STREAM_API_KEY=your-stream-key
NEXT_PUBLIC_APP_URL=https://influnet.io
```

**Runtime Variables** (read at runtime):
```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STREAM_API_KEY=your-stream-key
STREAM_API_SECRET=your-stream-secret
APP_ENV=production
NOTIFY_EMAILS_ENABLED=false
```

**3d. Set Supabase Edge Function secrets**
```bash
supabase secrets set TWOFACTOR_API_KEY=your-2factor-key --project-ref <PROD_REF>
```

**3e. Remove dangerous token**
1. Open `apps/web/.env.local`
2. Remove or comment out `SUPABASE_ACCESS_TOKEN=...`
3. This token should never be in the repo

**Verification:**
- [ ] All `NEXT_PUBLIC_*` vars are set in Railway Build variables
- [ ] All server-only secrets are in Railway Runtime variables
- [ ] `APP_ENV=production`
- [ ] `SUPABASE_ACCESS_TOKEN` removed from `.env.local`

**Completion:**
```
Railway variables configured: YES
Date completed: _______________
```

---

### Task 4: Configure Stream Webhook

**Why:** Stream needs to know where to send chat events so messages are mirrored to your database.

**Time:** 10 minutes

**Prerequisites:** Task 3 completed (production URL set)

**Steps:**
1. Go to https://dashboard.getstream.io
2. Select your app
3. Go to Chat → Webhooks
4. Click "Add Webhook"
5. Enter URL: `https://influnet.io/api/stream/webhook`
6. Select events:
   - [ ] message.new
   - [ ] message.updated
   - [ ] channel.updated
   - [ ] member.added
   - [ ] member.removed
7. Save

**Verification:**
- [ ] Webhook URL is `https://influnet.io/api/stream/webhook`
- [ ] Correct events are selected
- [ ] Webhook shows as "Active"

**Completion:**
```
Webhook configured: YES
Date completed: _______________
```

---

### Task 5: Enable Database Backups (PITR)

**Why:** Without backups, a mistake or outage means permanent data loss.

**Time:** 15 minutes + 1 hour to test restore

**Prerequisites:** Task 2 completed (production Supabase exists)

**Steps:**

**5a. Enable PITR**
1. Go to Supabase Dashboard → Production project
2. Settings → Database
3. Scroll to "Point in Time Recovery"
4. Enable PITR (requires paid plan)
5. Set retention period (7 days minimum, 30 days recommended)

**5b. Test a restore (CRITICAL)**
1. Go to Database → Backups
2. Find a recent backup
3. Click "Restore to a new project"
4. Create a scratch project
5. Wait for restore to complete
6. Verify data is intact (check a few tables)
7. Delete the scratch project after verification

**5c. Set up scheduled logical backup (optional but recommended)**
1. Create a GitHub Action that runs weekly
2. Use `pg_dump` to export the database
3. Store in encrypted object storage (S3/Azure Blob)
4. Keep 4 weeks of backups

**Verification:**
- [ ] PITR is enabled on production
- [ ] One restore was tested successfully
- [ ] Date of successful restore: _______________

**Completion:**
```
PITR enabled: YES
Restore tested: YES
Date completed: _______________
```

---

### Task 6: Make CI a Merge Gate

**Why:** Prevents shipping code that doesn't pass typecheck, lint, or tests.

**Time:** 5 minutes

**Steps:**
1. Go to GitHub → Settings → Branches
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable:
   - [ ] Require status checks to pass before merging
   - [ ] Require branches to be up to date before merging
5. Search for and select these checks:
   - [ ] `typecheck`
   - [ ] `lint`
   - [ ] `test`
   - [ ] `build`
6. Save changes

**Verification:**
- [ ] Cannot merge to `main` if any check fails
- [ ] PR shows "Required" status checks

**Completion:**
```
Branch protection enabled: YES
Date completed: _______________
```

---

## Phase 2: Monitoring & Error Tracking (Before Real Users)

### Task 7: Install Sentry Error Tracking

**Why:** Without Sentry, you can't see what errors users are hitting in production.

**Time:** 1-2 hours

**Steps:**

**7a. Create Sentry project**
1. Go to https://sentry.io
2. Create account (if needed)
3. Create new project → Next.js
4. Note the DSN (e.g., `https://xxx@sentry.io/xxx`)
5. Create another project → React Native (for mobile)
6. Note that DSN too

**7b. Install SDK on web**
```bash
cd apps/web
npx @sentry/wizard@latest -i nextjs
```

This will:
- Install `@sentry/nextjs`
- Create `sentry.client.config.ts`
- Create `sentry.server.config.ts`
- Create `sentry.edge.config.ts`
- Update `next.config.ts`

**7c. Configure Sentry**
1. Open `sentry.client.config.ts`
2. Set DSN:
```typescript
dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
```

3. Add to `.env.local`:
```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-auth-token
```

**7d. Remove old hand-rolled shim**
1. Open `apps/web/src/lib/observability.ts`
2. This file can be deleted or simplified since Sentry SDK handles everything now

**7e. Install SDK on mobile**
```bash
cd apps/mobile
npx @sentry/wizard@latest -i react-native
```

**7f. Set environment variables**
- Add to Railway production variables:
  - `NEXT_PUBLIC_SENTRY_DSN=...`
  - `SENTRY_DSN=...`
  - `SENTRY_ENVIRONMENT=production`

**Verification:**
- [ ] Sentry SDK installed on web
- [ ] Sentry SDK installed on mobile
- [ ] DSN configured in both apps
- [ ] Test error appears in Sentry dashboard (throw a test error)

**Completion:**
```
Sentry web project: _______________
Sentry mobile project: _______________
Date completed: _______________
Test error verified: YES
```

---

### Task 8: Configure Email (Resend)

**Why:** Users need to receive signup confirmations, password resets, and collaboration notifications.

**Time:** 30 minutes

**Steps:**

**8a. Create Resend account**
1. Go to https://resend.com
2. Create account
3. Go to API Keys
4. Create new API key
5. Copy the key (starts with `re_`)

**8b. Verify your domain**
1. Go to Resend → Domains
2. Add domain: `influnet.io`
3. Add the DNS records they provide:
   - [ ] SPF record
   - [ ] DKIM record
   - [ ] DMARC record (optional but recommended)
4. Wait for verification (can take 24-48 hours)

**8c. Set environment variables**
Add to Railway production variables:
```
RESEND_API_KEY=re_your-key-here
EMAIL_FROM=Influnet <noreply@influnet.io>
NOTIFY_EMAILS_ENABLED=true
```

**8d. Configure Supabase Auth SMTP**
1. Go to Supabase Dashboard → Production project
2. Auth → Email Templates
3. Set "Sender Email" to `noreply@influnet.io`
4. Customize templates if needed

**8e. Test email delivery**
1. Sign up with a test email
2. Check if confirmation email arrives
3. Test password reset
4. Check Resend dashboard for delivery status

**Verification:**
- [ ] Resend API key set
- [ ] Domain verified (green checkmark)
- [ ] `NOTIFY_EMAILS_ENABLED=true` in production
- [ ] Signup confirmation email received
- [ ] Password reset email received

**Completion:**
```
Resend API key: re_*** (masked)
Domain verified: YES
Emails sending: YES
Date completed: _______________
```

---

### Task 9: Add User-Friendly Error Messages

**Why:** Raw error messages (like "permission denied for table profiles") confuse users and look unprofessional.

**Time:** 1-2 hours

**Steps:**

**9a. Create error mapping helper**
1. Create `apps/web/src/lib/user-errors.ts`:
```typescript
/**
 * Maps raw errors to user-friendly messages.
 * Never expose raw error details to users.
 */
export function toUserMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Something went wrong. Please try again.';
  }

  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('fetch')) {
    return 'Connection problem. Please check your internet and try again.';
  }

  // Auth errors
  if (message.includes('unauthorized') || message.includes('session')) {
    return 'Your session expired. Please log in again.';
  }

  // Permission errors
  if (message.includes('permission') || message.includes('forbidden')) {
    return "You don't have permission to do that.";
  }

  // Validation errors
  if (message.includes('validation') || message.includes('invalid')) {
    return 'Please check your input and try again.';
  }

  // Rate limiting
  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Database errors
  if (message.includes('duplicate') || message.includes('already exists')) {
    return 'This already exists. Please try something else.';
  }

  // Default - never show raw message
  return 'Something went wrong. Please try again.';
}
```

**9b. Add global error boundary (web)**
1. Create `apps/web/src/app/global-error.tsx`:
```typescript
'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to Sentry
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>We're sorry for the inconvenience.</p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
```

**9c. Update dashboard pages to use the helper**
1. Find all places that show `err.message` in toasts
2. Replace with:
```typescript
import { toUserMessage } from '@/lib/user-errors';

// Instead of:
toast.error(error.message);

// Use:
toast.error(toUserMessage(error));
```

**Verification:**
- [ ] `toUserMessage()` helper exists
- [ ] `global-error.tsx` exists
- [ ] No raw error messages shown to users (search for `err.message`)

**Completion:**
```
Helper created: YES
Global error boundary: YES
Pages updated: _______________
Date completed: _______________
```

---

## Phase 3: Security & Rate Limiting (Before Paying Users)

### Task 10: Add Rate Limiting (Upstash)

**Why:** Without rate limiting, bots can spam signups, brute-force logins, or abuse your API.

**Time:** 1-2 hours

**Steps:**

**10a. Create Upstash Redis database**
1. Go to https://upstash.com
2. Create account
3. Create new Redis database
4. Choose region close to your users
5. Copy:
   - REST URL
   - REST Token

**10b. Install Upstash SDK**
```bash
cd apps/web
npm install @upstash/ratelimit @upstash/redis
```

**10c. Create rate limiter utility**
1. Create `apps/web/src/lib/rate-limit.ts`:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Different limits for different endpoints
export const rateLimiters = {
  // 5 requests per minute per IP
  signup: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
  }),

  // 10 requests per minute per IP
  login: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: true,
  }),

  // 3 reviews per hour per user
  review: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    analytics: true,
  }),

  // 20 requests per minute per IP
  discover: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    analytics: true,
  }),
};

export async function checkRateLimit(
  key: string,
  limiter: Ratelimit
): Promise<{ success: boolean; remaining: number }> {
  const { success, remaining } = await limiter.limit(key);
  return { success, remaining };
}
```

**10d. Add rate limiting to routes**
1. Update `apps/web/src/app/api/auth/register/route.ts`:
```typescript
import { checkRateLimit, rateLimiters } from '@/lib/rate-limit';

// In the POST handler, before creating user:
const ip = request.headers.get('x-forwarded-for') || 'unknown';
const { success } = await checkRateLimit(`signup:${ip}`, rateLimiters.signup);
if (!success) {
  return NextResponse.json(
    { error: 'Too many signup attempts. Please try again later.' },
    { status: 429 }
  );
}
```

2. Repeat for other routes (login, reviews, discover)

**10e. Set environment variables**
Add to Railway production variables:
```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

**Verification:**
- [ ] Upstash database created
- [ ] Rate limiter utility exists
- [ ] Rate limiting added to signup route
- [ ] Rate limiting added to login route
- [ ] Rate limiting added to review route
- [ ] Test: rapid signups are blocked

**Completion:**
```
Upstash database: _______________
Routes protected: _______________
Date completed: _______________
```

---

### Task 11: Add Admin Audit Log

**Why:** You need to track who approved/rejected what, especially for compliance and debugging.

**Time:** 1-2 hours

**Steps:**

**11a. Create database migration**
1. Create `supabase/migrations/089_admin_audit_log.sql`:
```sql
-- Admin audit log table
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'approve_business', 'reject_business', 'ban_user', etc.
  target_type TEXT NOT NULL, -- 'business', 'user', 'project', etc.
  target_id UUID NOT NULL,
  details JSONB, -- optional: reason, notes, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_log_target ON public.admin_audit_log(target_type, target_id);
CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log(created_at);

-- RLS: only admins can read, service role can write
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role bypasses RLS, so no INSERT policy needed
```

**11b. Apply migration**
```bash
supabase db push
```

**11c. Add logging to admin routes**
1. Create `apps/web/src/lib/admin-audit.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>
) {
  await supabase.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}
```

2. Update admin routes to call `logAdminAction()`:
```typescript
// In apps/web/src/app/api/admin/businesses/route.ts
import { logAdminAction } from '@/lib/admin-audit';

// After approving a business:
await logAdminAction(
  user.id,
  'approve_business',
  'business',
  businessUserId,
  { company_name: business.company_name }
);
```

**Verification:**
- [ ] Migration created and applied
- [ ] `admin_audit_log` table exists
- [ ] Audit logging function exists
- [ ] Admin approval routes log actions
- [ ] Admin rejection routes log actions

**Completion:**
```
Migration applied: YES
Routes updated: _______________
Date completed: _______________
```

---

## Phase 4: Analytics & Insights (After Launch)

### Task 12: Add PostHog Analytics

**Why:** You need to understand where users drop off in the 12-stage pipeline.

**Time:** 2-3 hours

**Steps:**

**12a. Create PostHog project**
1. Go to https://posthog.com
2. Create account
3. Create new project
4. Copy the API key (starts with `phc_`)

**12b. Install PostHog SDK**
```bash
cd apps/web
npm install posthog-js
```

**12c. Initialize PostHog**
1. Create `apps/web/src/lib/analytics.ts`:
```typescript
import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    // Enable session recording for debugging
    session_recording: {
      maskTextSelector: '.sensitive', // Mask elements with this class
    },
  });
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties);
}

export function resetAnalytics() {
  posthog.reset();
}
```

**12d. Add analytics to key flows**

1. **Signup flow:**
```typescript
import { trackEvent } from '@/lib/analytics';

// After successful signup
trackEvent('signup_completed', { role: 'creator' });
```

2. **Collaboration flow:**
```typescript
// When collab request sent
trackEvent('collab_request_sent', { budget: deal.budget });

// When accepted
trackEvent('collab_request_accepted');
```

3. **Pipeline stages:**
```typescript
// When stage advances
trackEvent('stage_advanced', {
  project_id: project.id,
  from_stage: previousStage,
  to_stage: newStage,
  actor_role: user.role,
});
```

4. **Completion:**
```typescript
trackEvent('project_completed', {
  project_id: project.id,
  total_stages: 12,
});
```

**12e. Set environment variables**
Add to Railway:
```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

**Verification:**
- [ ] PostHog SDK installed
- [ ] Analytics utility exists
- [ ] Signup events tracked
- [ ] Collab events tracked
- [ ] Stage progression tracked
- [ ] Test event appears in PostHog dashboard

**Completion:**
```
PostHog project: _______________
Events tracked: _______________
Date completed: _______________
```

---

### Task 13: Add Uptime Monitoring

**Why:** You need to know immediately if your service goes down.

**Time:** 10 minutes

**Steps:**

**13a. Create Better Stack account**
1. Go to https://betterstack.com
2. Create account (free tier)
3. Create new monitor
4. Set URL: `https://influnet.io/api/health`
5. Set check interval: 1 minute
6. Add notification email

**Alternative: UptimeRobot**
1. Go to https://uptimerobot.com
2. Create account
3. Add new monitor
4. Set URL: `https://influnet.io/api/health`
5. Set interval: 5 minutes

**13b. Verify health endpoint works**
```bash
curl https://influnet.io/api/health
# Should return: {"status":"healthy","database":"connected"}
```

**Verification:**
- [ ] Uptime monitor created
- [ ] Health endpoint returns 200
- [ ] Notifications configured

**Completion:**
```
Monitor URL: _______________
Check interval: _______________
Date completed: _______________
```

---

## Phase 5: Polish & Compliance (Ongoing)

### Task 14: Add Support/Ticket System

**Why:** Users need a way to report problems, and you need to track issues.

**Time:** 2-3 hours

**Steps:**

**Option A: Simple Email Form (Fastest)**
1. Create a "Contact Support" page
2. Add a form that sends to `support@influnet.io`
3. Use Resend to send the email

**Option B: In-House Ticket Table (Better)**
1. Create migration for `support_tickets` table
2. Add "Report a Problem" button to error boundaries
3. Auto-fill route, error, user ID
4. Create admin view to see tickets

**Verification:**
- [ ] Support contact method exists
- [ ] Error boundaries have "Report" button
- [ ] Tickets are received

**Completion:**
```
Support method: email / in-house
Date completed: _______________
```

---

### Task 15: Add Legal Pages

**Why:** Required for compliance (GDPR, Indian DPDP) and to protect your business.

**Time:** 2-3 hours

**Steps:**
1. Create Terms of Service page
2. Create Privacy Policy page
3. Add cookie consent banner
4. Add links in footer
5. Add data deletion request flow (settings page)

**Verification:**
- [ ] Terms of Service exists
- [ ] Privacy Policy exists
- [ ] Cookie consent works
- [ ] Data deletion flow works

**Completion:**
```
Pages created: _______________
Date completed: _______________
```

---

### Task 16: Payment Integration (Razorpay)

**Why:** Currently payment stages are cosmetic — no real money moves through the platform.

**Time:** 4-6 hours

**Steps:**
1. Create Razorpay account
2. Create `project_payments` table migration
3. Add Razorpay SDK
4. Implement order creation
5. Add webhook handler (signature verification)
6. Gate payment stages on verified payment

**Verification:**
- [ ] Razorpay account created
- [ ] Payment table exists
- [ ] Orders can be created
- [ ] Webhook verifies signatures
- [ ] Test payment completes flow

**Completion:**
```
Razorpay account: _______________
Date completed: _______________
```

---

### Task 17: Set Up Secret Management (Infisical)

**Why:** Centralized secret management across all environments (dev/staging/prod) without constantly switching to GitHub Settings.

**Time:** 1 hour

**Status:** Infisical CLI installed and account created. Need to complete project linking and add secrets.

**Steps:**

**17a. Create Infisical project (DONE)**
- [x] Infisical account created at https://app.infisical.com
- [x] Infisical CLI installed globally (`npm i -g @infisical/cli`)
- [x] Project `influnet` created with environments: dev, staging, production

**17b. Link local project**
1. Run `infisical init` in project root
2. Select `influnet` project
3. Select `dev` as default environment
4. Verify `.infisical.json` file created

**17c. Add secrets for each environment**

**Dev environment secrets:**
```env
NEXT_PUBLIC_APP_URL=https://dev.influnet.io
NEXT_PUBLIC_SUPABASE_URL=<dev-supabase-url>
SUPABASE_URL=<dev-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key>
NEXT_PUBLIC_STREAM_API_KEY=<dev-stream-key>
STREAM_API_KEY=<dev-stream-key>
STREAM_API_SECRET=<dev-stream-secret>
RESEND_API_KEY=<resend-key>
EMAIL_FROM=Influnet <noreply@influnet.io>
NOTIFY_EMAILS_ENABLED=false
NEXT_PUBLIC_SENTRY_DSN=<staging-sentry-dsn>
SENTRY_DSN=<staging-sentry-dsn>
APIFY_TOKEN=<apify-token>
UPSTASH_REDIS_REST_URL=<upstash-url>
UPSTASH_REDIS_REST_TOKEN=<upstash-token>
EXPO_PUBLIC_SUPABASE_URL=<dev-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<dev-anon-key>
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_STREAM_API_KEY=<dev-stream-key>
```

**Staging environment secrets:**
- Same keys, different values for staging services

**Production environment secrets:**
- Same keys, different values for production services
- `NOTIFY_EMAILS_ENABLED=true`
- Production Sentry DSNs

**17d. Update GitHub Actions to use Infisical (optional)**
- Add Infisical GitHub Action to workflows
- Remove secrets from GitHub Secrets after migration

**Verification:**
- [ ] `infisical init` completed successfully
- [ ] `.infisical.json` file exists in project root
- [ ] Secrets added to dev environment
- [ ] Secrets added to staging environment
- [ ] Secrets added to production environment
- [ ] Test: `infisical run --env=dev -- npm run dev` works

**Completion:**
```
Infisical project ID: _______________
Date completed: _______________
Secrets migrated: YES / NO
```

---

## Task Completion Log

| Task | Completed Date | Notes |
|------|----------------|-------|
| 1. Confirm Staging ≠ Prod DB | | |
| 2. Provision Production Supabase | | |
| 3. Set Production Env Vars | | |
| 4. Configure Stream Webhook | | |
| 5. Enable Database Backups | | |
| 6. Make CI a Merge Gate | | |
| 7. Install Sentry | | |
| 8. Configure Email (Resend) | | |
| 9. Add User-Friendly Errors | | |
| 10. Add Rate Limiting | | |
| 11. Add Admin Audit Log | | |
| 12. Add PostHog Analytics | | |
| 13. Add Uptime Monitoring | | |
| 14. Add Support System | | |
| 15. Add Legal Pages | | |
| 16. Payment Integration | | |

---

## Quick Reference: Environment Variables

### Railway Build Variables (inlined at build time)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_STREAM_API_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_RAZORPAY_KEY_ID
```

### Railway Runtime Variables (read at runtime)
```
SUPABASE_SERVICE_ROLE_KEY
STREAM_API_KEY
STREAM_API_SECRET
SENTRY_DSN
SENTRY_ENVIRONMENT
RESEND_API_KEY
EMAIL_FROM
NOTIFY_EMAILS_ENABLED
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
APP_ENV
```

### Supabase Edge Function Secrets
```
TWOFACTOR_API_KEY
```

---

## What's Next?

After completing all tasks:
1. Run the full QA script in `QA_AND_GO_LIVE.md`
2. Monitor Sentry for errors
3. Watch PostHog for funnel drop-offs
4. Collect user feedback
5. Iterate based on real usage

---

*Last updated: August 2, 2026*
