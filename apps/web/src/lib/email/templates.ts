import {
  renderEmail,
  p,
  h,
  button,
  panel,
  details,
  figure,
  quote,
  steps,
  code,
  fineprint,
  divider,
  esc,
} from './layout';
import { theme } from './theme';

/**
 * Every email Influnet can send, in one registry.
 *
 * A template is a pure function of its data — no DB, no env beyond the base
 * URL — which is what lets the admin preview render any of them with sample
 * data without sending anything.
 */

/**
 * Consent tier. Decides whether a recipient can switch the mail off.
 *
 *  - `account`  tier A: security and account state. Never optional, no
 *               unsubscribe link (a password reset with an unsubscribe footer
 *               is a phishing tell, not a courtesy).
 *  - `activity` tier B: things that happened in a collab they are party to.
 *               Opt-out per category, unsubscribe link required.
 *  - `marketing` tier C: product news. Explicit opt-in only.
 */
export type EmailTier = 'account' | 'activity' | 'marketing';

/** Opt-out unit shown in settings. Tier A templates use `account` and ignore preferences. */
export type EmailCategory = 'account' | 'collab' | 'project' | 'payment' | 'message' | 'marketing';

export interface RenderContext {
  /** Present for tier-B/C mail; renders the footer unsubscribe link. */
  unsubscribeUrl?: string;
}

export interface TemplateDef<T> {
  id: string;
  label: string;
  /** Shown in the admin picker so it is obvious when each one fires. */
  description: string;
  tier: EmailTier;
  category: EmailCategory;
  /** Realistic data used by the admin preview and test sends. */
  sample: T;
  subject: (data: T) => string;
  render: (data: T, ctx?: RenderContext) => string;
}

function define<T>(def: TemplateDef<T>): TemplateDef<T> {
  return def;
}

/** Why-am-I-getting-this footer line, per category. */
const REASON: Record<EmailCategory, string> = {
  account: 'This is an account security email for your Influnet account. We send these regardless of your notification settings.',
  collab: 'You are receiving this because you have collaboration notifications turned on.',
  project: 'You are receiving this because you are part of this project on Influnet.',
  payment: 'You are receiving this because it concerns a payment on your Influnet account.',
  message: 'You are receiving this because you have message notifications turned on.',
  marketing: 'You are receiving this because you opted in to product updates from Influnet.',
};

const inr = (amount: string | number) => `₹${typeof amount === 'number' ? amount.toLocaleString('en-IN') : amount}`;

/** Minutes as something a person would say out loud — "24 hours", not "1440 minutes". */
const duration = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'a short while';
  if (minutes < 120) return `${Math.round(minutes)} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
};

// ── Tier A — account & security ─────────────────────────────────────────────

export const welcomeEmail = define({
  id: 'welcome',
  label: 'Welcome',
  description: 'Sent once, right after a profile is created.',
  tier: 'account',
  category: 'account',
  sample: {
    name: 'Ananya',
    role: 'influencer' as 'influencer' | 'business_owner',
    dashboardUrl: '/dashboard',
  },
  subject: (d) => `Welcome to Influnet, ${d.name}`,
  render: (d, ctx) => {
    const creator = d.role === 'influencer';
    return renderEmail({
      preheader: creator
        ? 'Set up your profile so brands can find you and send collaboration requests.'
        : 'Set up your business so you can discover creators and start collaborating.',
      heading: `Welcome, ${d.name}`,
      kicker: creator
        ? 'Your creator account is ready.'
        : 'Your business account is ready.',
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.account,
      body: [
        p(
          creator
            ? `Influnet is where brands find creators and run the whole collaboration in one place — the brief, the drafts, the approvals and the payment. No more chasing things across DMs and spreadsheets.`
            : `Influnet is where you find creators and run the whole collaboration in one place — the brief, the drafts, the approvals and the payment. Every step is tracked, so nobody has to ask "where are we on this?".`,
        ),
        h('Get started'),
        steps(
          creator
            ? [
                '<strong>Complete your profile</strong> — a niche, a bio and a few portfolio pieces are what brands search on.',
                '<strong>Verify your Instagram or YouTube</strong> to get the verified badge. Verified creators get noticeably more requests.',
                '<strong>Set your rates</strong> so brands send you offers that are worth your time.',
              ]
            : [
                '<strong>Complete your business profile</strong> and submit it for verification — creators check this before accepting.',
                '<strong>Browse Discovery</strong> and filter creators by niche, audience and location.',
                '<strong>Send your first request</strong> with a clear brief and budget. Clear briefs get answered fastest.',
              ],
        ),
        button(creator ? 'Complete my profile' : 'Find creators', d.dashboardUrl),
        divider(),
        fineprint(`Questions, or something not working? Just reply to this email — a person reads it.`),
      ].join(''),
    });
  },
});

export const verifyEmailEmail = define({
  id: 'verify_email',
  label: 'Verify email address',
  description: 'Confirms ownership of the address at signup. Also available as a Supabase Auth template.',
  tier: 'account',
  category: 'account',
  sample: { name: 'Ananya', verifyUrl: 'https://influnet.io/auth/confirm?token=sample', expiresInHours: 24 },
  subject: () => 'Confirm your email address',
  render: (d) =>
    renderEmail({
      preheader: 'One click confirms your address and finishes your Influnet signup.',
      heading: 'Confirm your email',
      kicker: 'One last step.',
      reason: REASON.account,
      body: [
        p(`Hi ${esc(d.name)}, confirm this address to finish setting up your Influnet account.`),
        button('Confirm my email', d.verifyUrl),
        fineprint(`This link expires in ${d.expiresInHours} hours. If it has expired, sign in and we will send you a new one.`),
        fineprint(`If you did not create an Influnet account, ignore this email — nothing will be activated.`),
        divider(),
        fineprint(`Button not working? Paste this into your browser:<br /><span style="color:${theme.muted};word-break:break-all;">${esc(d.verifyUrl)}</span>`),
      ].join(''),
    }),
});

export const passwordResetEmail = define({
  id: 'password_reset',
  label: 'Password reset',
  description: 'Reset link. Sent by Supabase Auth in production — this is the design source for that template.',
  tier: 'account',
  category: 'account',
  sample: { name: 'Ananya', resetUrl: 'https://influnet.io/reset-password?token=sample', expiresInMinutes: 60 },
  subject: () => 'Reset your Influnet password',
  render: (d) =>
    renderEmail({
      preheader: 'Use the link inside to choose a new password. It expires in an hour.',
      heading: 'Reset your password',
      reason: REASON.account,
      body: [
        p(`Hi ${esc(d.name)}, we got a request to reset the password on your Influnet account. Choose a new one here:`),
        button('Choose a new password', d.resetUrl),
        fineprint(`This link expires in ${d.expiresInMinutes} minutes and can only be used once.`),
        panel(
          {
            title: "Didn't request this?",
            text: 'You can safely ignore this email — your password stays as it is. If you keep getting these, reply and tell us.',
          },
          'warning',
        ),
        divider(),
        fineprint(`Button not working? Paste this into your browser:<br /><span style="color:${theme.muted};word-break:break-all;">${esc(d.resetUrl)}</span>`),
      ].join(''),
    }),
});

export const linkExpiredEmail = define({
  id: 'link_expired',
  label: 'Link expired — here is a new one',
  description: 'Re-issues an expired confirmation or reset link.',
  tier: 'account',
  category: 'account',
  sample: {
    name: 'Ananya',
    kind: 'password reset' as string,
    newUrl: 'https://influnet.io/reset-password?token=fresh',
    expiresInMinutes: 60,
  },
  subject: (d) => `Your ${d.kind} link expired — here's a new one`,
  render: (d) =>
    renderEmail({
      preheader: 'Your previous link timed out. This one is fresh.',
      heading: 'Here is a fresh link',
      kicker: `Your previous ${d.kind} link had expired.`,
      reason: REASON.account,
      body: [
        p(`Hi ${esc(d.name)}, links time out for security — usually because they sat in the inbox for a while. Here is a new one.`),
        button('Open the new link', d.newUrl),
        fineprint(`This link expires in ${d.expiresInMinutes} minutes. Use it soon and you won't see this email again.`),
        fineprint(`If you did not ask for this, ignore it — nothing has changed on your account.`),
      ].join(''),
    }),
});

export const emailChangeEmail = define({
  id: 'email_change',
  label: 'Confirm new email address',
  description: 'Sent to the NEW address when someone changes their login email.',
  tier: 'account',
  category: 'account',
  sample: {
    name: 'Ananya',
    oldEmail: 'ananya@old.com',
    newEmail: 'ananya@new.com',
    confirmUrl: 'https://influnet.io/auth/confirm?token=sample',
  },
  subject: () => 'Confirm your new email address',
  render: (d) =>
    renderEmail({
      preheader: 'Confirm this address to finish moving your Influnet login.',
      heading: 'Confirm your new address',
      reason: REASON.account,
      body: [
        p(`Hi ${esc(d.name)}, you asked to change the email address on your Influnet account.`),
        details([
          ['Current', d.oldEmail],
          ['New', d.newEmail],
        ]),
        p(`Confirm the new address and it becomes your login. Until you do, the current one keeps working.`),
        button('Confirm new address', d.confirmUrl),
        fineprint(`If you did not request this, reply to this email immediately — someone may have access to your account.`),
      ].join(''),
    }),
});

export const verificationCodeEmail = define({
  id: 'verification_code',
  label: 'Social ownership link',
  description: 'The profile link a creator puts in their Instagram/YouTube bio to prove ownership.',
  tier: 'account',
  category: 'account',
  sample: {
    name: 'Ananya',
    platform: 'Instagram',
    handle: '@ananya.creates',
    code: 'https://influnet.io/c/ananya',
    expiresInMinutes: 60,
    dashboardUrl: '/dashboard/verify',
  },
  subject: (d) => `Verify ${d.handle} on ${d.platform}`,
  render: (d) =>
    renderEmail({
      preheader: `Add your Influnet profile link to your ${d.platform} bio to get verified.`,
      heading: 'Verify your account',
      kicker: `To verify ${d.handle} on ${d.platform}.`,
      reason: REASON.account,
      // The marker is the creator's PUBLIC PROFILE LINK, not a throwaway code
      // (see api/verification/ownership/route.ts). The copy has to match that:
      // telling someone to remove it afterwards would undo the one thing we
      // actually want left in their bio.
      body: [
        p(`Hi ${esc(d.name)}, add this link anywhere in your ${esc(d.platform)} bio, keep the account public, then come back and hit Check.`),
        code(d.code),
        p(`You can leave it there for good — it is the page you want brands landing on anyway, and it keeps your verified badge from lapsing.`),
        // The window is 24h, so "1440 minutes" is technically right and useless.
        fineprint(`This verification window stays open for ${duration(d.expiresInMinutes)}. If it closes before you finish, just start it again from the dashboard — there is no limit.`),
        button('Check my bio', d.dashboardUrl),
        divider(),
        fineprint(`We never ask for your ${esc(d.platform)} password. Verification only ever reads your public bio, and nothing is ever posted to your account.`),
      ].join(''),
    }),
});

export const businessApprovedEmail = define({
  id: 'business_approved',
  label: 'Business verified',
  description: 'Admin approved a business verification request.',
  tier: 'account',
  category: 'account',
  sample: { businessName: 'Nomad Coffee Co.', dashboardUrl: '/dashboard' },
  subject: () => 'Your business is verified on Influnet',
  render: (d) =>
    renderEmail({
      preheader: 'You can now send collaboration requests to creators.',
      heading: 'Your business is verified',
      kicker: `${d.businessName} passed verification.`,
      reason: REASON.account,
      body: [
        p(`Good news — we have reviewed and verified <strong>${esc(d.businessName)}</strong>. Your account is now fully unlocked.`),
        panel(
          {
            title: 'What this unlocks',
            text: 'The verified badge on your public profile<br />Sending collaboration requests to creators<br />Higher acceptance rates — creators check for this badge',
          },
          'success',
        ),
        button('Start collaborating', d.dashboardUrl),
      ].join(''),
    }),
});

export const businessRejectedEmail = define({
  id: 'business_rejected',
  label: 'Business verification declined',
  description: 'Admin declined a business verification request.',
  tier: 'account',
  category: 'account',
  sample: {
    businessName: 'Nomad Coffee Co.',
    reason: 'The GST number did not match the registered business name.',
    dashboardUrl: '/dashboard/settings',
  },
  subject: () => 'About your business verification',
  render: (d) =>
    renderEmail({
      preheader: 'We need a correction before we can verify your business.',
      heading: 'We need one correction',
      kicker: `${d.businessName} is not verified yet.`,
      reason: REASON.account,
      body: [
        p(`We reviewed the verification request for <strong>${esc(d.businessName)}</strong> and could not approve it as submitted.`),
        d.reason
          ? panel({ title: 'What needs fixing', text: esc(d.reason) }, 'warning')
          : p(`Please review your business details and resubmit.`),
        p(`Fix it and resubmit — there is no limit on attempts and it usually takes us under a day to review.`),
        button('Update my details', d.dashboardUrl),
        fineprint(`Not sure what to change? Reply to this email and we will tell you exactly.`),
      ].join(''),
    }),
});

// ── Tier B — collaboration activity ─────────────────────────────────────────

export const collabRequestEmail = define({
  id: 'collab_request',
  label: 'New collaboration request',
  description: 'A business sent a creator a request.',
  tier: 'activity',
  category: 'collab',
  sample: {
    creatorName: 'Ananya',
    businessName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    budget: '25,000',
    deliverables: '2 Reels + 3 Stories',
    deadline: '20 Aug 2026',
    dashboardUrl: '/dashboard/requests',
  },
  subject: (d) => `${d.businessName} wants to collaborate with you`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${d.projectName}${d.budget ? ` · ${inr(d.budget)}` : ''} — review it in your dashboard.`,
      heading: 'New collaboration request',
      kicker: `From ${d.businessName}`,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.collab,
      body: [
        p(`Hi ${esc(d.creatorName)}, <strong>${esc(d.businessName)}</strong> would like to work with you.`),
        details([
          ['Project', d.projectName],
          d.budget ? ['Budget', inr(d.budget)] : null,
          d.deliverables ? ['Deliverables', d.deliverables] : null,
          d.deadline ? ['Deadline', d.deadline] : null,
        ]),
        p(`Nothing is committed yet — accepting opens a chat where you agree the details together before any project starts.`),
        button('Review the request', d.dashboardUrl),
        // Requests do not expire: there is no expires_at column on
        // collab_requests and nothing ages them out. Promising a deadline here
        // would be the email inventing a lifecycle the product does not have.
        fineprint(`Not a fit? Declining takes one tap and is completely fine.`),
      ].join(''),
    }),
});

export const collabAcceptedEmail = define({
  id: 'collab_accepted',
  label: 'Request accepted',
  description: 'The creator accepted — tells the business what happens next.',
  tier: 'activity',
  category: 'collab',
  sample: {
    businessName: 'Nomad Coffee Co.',
    creatorName: 'Ananya',
    projectName: 'Winter roast launch',
    dashboardUrl: '/dashboard/requests',
  },
  subject: (d) => `${d.creatorName} accepted your request`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `Agree the details in chat, then propose the project.`,
      heading: 'Your request was accepted',
      kicker: `${d.creatorName} is in.`,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.collab,
      body: [
        p(`Hi ${esc(d.businessName)} — <strong>${esc(d.creatorName)}</strong> accepted your request for <strong>${esc(d.projectName)}</strong>.`),
        h('What happens next'),
        steps([
          '<strong>Talk it through in chat</strong> — scope, deliverables, timeline, budget.',
          '<strong>Propose the project</strong> when you both agree. Both sides confirm before it starts.',
          '<strong>Work the stages</strong> — brief, drafts, approval, publish, payment. Every step is tracked for both of you.',
        ]),
        button('Open the chat', d.dashboardUrl),
      ].join(''),
    }),
});

export const collabDeclinedEmail = define({
  id: 'collab_declined',
  label: 'Request declined',
  description: 'The creator declined. Kept short and non-judgemental.',
  tier: 'activity',
  category: 'collab',
  sample: {
    businessName: 'Nomad Coffee Co.',
    creatorName: 'Ananya',
    projectName: 'Winter roast launch',
    discoveryUrl: '/dashboard/discovery',
  },
  subject: (d) => `Update on your request to ${d.creatorName}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: 'Not this time — here are other creators in the same niche.',
      heading: 'Request declined',
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.collab,
      body: [
        p(`<strong>${esc(d.creatorName)}</strong> is not able to take on <strong>${esc(d.projectName)}</strong> right now.`),
        p(`This is usually about timing or capacity rather than the brief. Creators who fit your niche are one search away.`),
        button('Find other creators', d.discoveryUrl),
        fineprint(`Tip: requests with a clear deliverable list and a stated budget get accepted far more often.`),
      ].join(''),
    }),
});

export const collabExpiringEmail = define({
  id: 'collab_expiring',
  label: 'Request expiring soon',
  description: 'Nudge before a pending collaboration request times out.',
  tier: 'activity',
  category: 'collab',
  sample: {
    recipientName: 'Ananya',
    businessName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    budget: '25,000',
    hoursLeft: 24,
    dashboardUrl: '/dashboard/requests',
  },
  subject: (d) => `Expiring soon: ${d.businessName}'s request`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${d.hoursLeft} hours left to respond to ${d.projectName}.`,
      heading: 'This request expires soon',
      kicker: `${d.hoursLeft} hours left.`,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.collab,
      body: [
        p(`Hi ${esc(d.recipientName)}, <strong>${esc(d.businessName)}</strong> is still waiting to hear from you.`),
        details([
          ['Project', d.projectName],
          d.budget ? ['Budget', inr(d.budget)] : null,
          ['Time left', `${d.hoursLeft} hours`],
        ]),
        p(`After that it closes automatically and they will assume it is a no.`),
        button('Respond now', d.dashboardUrl),
        fineprint(`Declining is a perfectly good answer — it frees them up to approach someone else.`),
      ].join(''),
    }),
});

// ── Tier B — project activity ───────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  brief: 'Brief',
  brainstorm: 'Brainstorming',
  content_plan: 'Content plan',
  draft: 'Draft',
  review: 'Review',
  revision: 'Revision',
  approved: 'Approved',
  scheduled: 'Scheduled',
  sent_for_review: 'Sent for review',
  live: 'Live',
  performance: 'Performance',
  feedback: 'Feedback',
  completed: 'Completed',
};

export const projectStageEmail = define({
  id: 'project_stage',
  label: 'Project stage moved',
  description: 'The other side advanced the project to a new stage.',
  tier: 'activity',
  category: 'project',
  sample: {
    recipientName: 'Ananya',
    projectName: 'Winter roast launch',
    stage: 'draft',
    actorName: 'Nomad Coffee Co.',
    note: 'Uploaded the first cut of the Reel — have a look when you can.',
    dashboardUrl: '/dashboard/projects',
  },
  subject: (d) => `${d.projectName} moved to ${STAGE_LABELS[d.stage] || d.stage}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${d.actorName} moved the project forward.`,
      heading: STAGE_LABELS[d.stage] || d.stage,
      kicker: d.projectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        p(`Hi ${esc(d.recipientName)}, <strong>${esc(d.actorName)}</strong> moved <strong>${esc(d.projectName)}</strong> to <strong>${esc(STAGE_LABELS[d.stage] || d.stage)}</strong>.`),
        d.note ? quote(d.note) : '',
        button('Open the project', d.dashboardUrl),
      ].join(''),
    }),
});

export const projectActionNeededEmail = define({
  id: 'project_action_needed',
  label: 'Your turn on a project',
  description: 'The project is blocked waiting on this person.',
  tier: 'activity',
  category: 'project',
  sample: {
    recipientName: 'Ananya',
    projectName: 'Winter roast launch',
    stage: 'review',
    action: 'Review the draft and either approve it or request changes.',
    waitingSince: '2 days',
    dashboardUrl: '/dashboard/projects',
  },
  subject: (d) => `Your turn: ${d.projectName}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${d.action}`,
      heading: "It's your turn",
      kicker: d.projectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        p(`Hi ${esc(d.recipientName)}, <strong>${esc(d.projectName)}</strong> cannot move forward until you act.`),
        panel(
          { eyebrow: STAGE_LABELS[d.stage] || d.stage, title: d.action },
          'brand',
        ),
        d.waitingSince ? fineprint(`The other side has been waiting <strong>${esc(d.waitingSince)}</strong>.`) : '',
        button('Take action', d.dashboardUrl),
      ].join(''),
    }),
});

export const projectCompletedEmail = define({
  id: 'project_completed',
  label: 'Project completed',
  description: 'Both sides confirmed completion. Asks for the review.',
  tier: 'activity',
  category: 'project',
  sample: {
    recipientName: 'Ananya',
    partnerName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    reviewUrl: '/dashboard/projects',
  },
  subject: (d) => `${d.projectName} is complete`,
  render: (d, ctx) =>
    renderEmail({
      preheader: 'Leave a review — it is what future partners look at first.',
      heading: 'Project complete',
      kicker: d.projectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        p(`Nice work, ${esc(d.recipientName)} — <strong>${esc(d.projectName)}</strong> with <strong>${esc(d.partnerName)}</strong> is done and confirmed by both sides.`),
        p(`One last thing: leave a review. Reviews are the first thing people look at before agreeing to work together, and yours takes about thirty seconds.`),
        button(`Review ${d.partnerName}`, d.reviewUrl),
        fineprint(`The finished project now shows on your profile as proof of work.`),
      ].join(''),
    }),
});

export const reviewReceivedEmail = define({
  id: 'review_received',
  label: 'You received a review',
  description: 'A partner left a review after completion.',
  tier: 'activity',
  category: 'project',
  sample: {
    recipientName: 'Ananya',
    reviewerName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    rating: 5,
    comment: 'Delivered ahead of schedule and the Reel outperformed our own channel. Would work with again.',
    profileUrl: '/dashboard/profile',
  },
  subject: (d) => `${d.reviewerName} left you a ${d.rating}-star review`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${'★'.repeat(Math.max(0, Math.min(5, d.rating)))} from ${d.reviewerName}.`,
      heading: 'You got a new review',
      kicker: `From ${d.reviewerName}`,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        p(`Hi ${esc(d.recipientName)}, <strong>${esc(d.reviewerName)}</strong> reviewed your work on <strong>${esc(d.projectName)}</strong>.`),
        figure(
          `${d.rating} out of 5`,
          '★'.repeat(Math.max(0, Math.min(5, d.rating))) + '☆'.repeat(Math.max(0, 5 - d.rating)),
          'brand',
        ),
        d.comment ? quote(d.comment) : '',
        button('See it on my profile', d.profileUrl),
      ].join(''),
    }),
});

// ── Tier B — payments ───────────────────────────────────────────────────────

export const paymentReceivedEmail = define({
  id: 'payment_received',
  label: 'Payment received',
  description: 'Razorpay confirmed a payment on a project.',
  tier: 'activity',
  category: 'payment',
  sample: {
    recipientName: 'Ananya',
    projectName: 'Winter roast launch',
    amount: '12,500',
    paymentType: 'advance' as 'advance' | 'final' | 'full',
    paymentId: 'pay_QxAb12Cd34Ef56',
    paidOn: '2 Aug 2026',
    dashboardUrl: '/dashboard/projects',
  },
  subject: (d) => `Payment received: ${inr(d.amount)} for ${d.projectName}`,
  render: (d, ctx) => {
    const label = { advance: 'Advance payment', final: 'Final payment', full: 'Full payment' }[d.paymentType];
    return renderEmail({
      preheader: `${inr(d.amount)} confirmed for ${d.projectName}.`,
      heading: 'Payment received',
      kicker: d.projectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.payment,
      body: [
        p(`Hi ${esc(d.recipientName)}, a payment on <strong>${esc(d.projectName)}</strong> has cleared.`),
        figure(label, inr(d.amount), 'success'),
        details([
          ['Project', d.projectName],
          ['Type', label],
          d.paidOn ? ['Date', d.paidOn] : null,
          d.paymentId ? ['Reference', d.paymentId] : null,
        ]),
        button('View the project', d.dashboardUrl),
        fineprint(`Keep the reference above — quote it if you ever need us to look this payment up.`),
      ].join(''),
    });
  },
});

export const paymentFailedEmail = define({
  id: 'payment_failed',
  label: 'Payment failed',
  description: 'A payment attempt did not go through.',
  tier: 'activity',
  category: 'payment',
  sample: {
    recipientName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    amount: '12,500',
    reason: 'The bank declined the card.',
    dashboardUrl: '/dashboard/projects',
  },
  subject: (d) => `Payment failed for ${d.projectName}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: `${inr(d.amount)} did not go through. Nothing was charged.`,
      heading: 'Payment did not go through',
      kicker: d.projectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.payment,
      body: [
        p(`Hi ${esc(d.recipientName)}, the ${inr(d.amount)} payment for <strong>${esc(d.projectName)}</strong> failed.`),
        panel(
          {
            title: 'Reason given',
            text: esc(d.reason || 'The payment provider did not give a reason.'),
          },
          'danger',
        ),
        p(`<strong>Nothing has been charged.</strong> The project is paused at this step until a payment succeeds.`),
        button('Try again', d.dashboardUrl),
        fineprint(`If it keeps failing, try a different method or reply here and we will look at it with you.`),
      ].join(''),
    }),
});

// ── Tier B — messages ───────────────────────────────────────────────────────

export const unreadMessagesEmail = define({
  id: 'unread_messages',
  label: 'Unread messages (rollup)',
  description: 'Hourly rollup — never one email per message.',
  tier: 'activity',
  category: 'message',
  sample: {
    recipientName: 'Ananya',
    senderName: 'Nomad Coffee Co.',
    projectName: 'Winter roast launch',
    messageCount: 3,
    preview: 'Quick one — can we push the shoot to Thursday? The roast lands a day late.',
    dashboardUrl: '/dashboard/messages',
  },
  subject: (d) =>
    d.messageCount > 1
      ? `${d.messageCount} new messages from ${d.senderName}`
      : `New message from ${d.senderName}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: d.preview,
      heading: d.messageCount > 1 ? `${d.messageCount} new messages` : 'New message',
      kicker: `From ${d.senderName}`,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.message,
      body: [
        // Not every conversation belongs to a project — people talk before
        // any project exists, which is the whole point of accepting a request.
        p(
          d.projectName
            ? `Hi ${esc(d.recipientName)}, <strong>${esc(d.senderName)}</strong> messaged you about <strong>${esc(d.projectName)}</strong>.`
            : `Hi ${esc(d.recipientName)}, <strong>${esc(d.senderName)}</strong> sent you a message.`,
        ),
        d.preview ? quote(d.preview) : '',
        button('Reply', d.dashboardUrl),
        fineprint(`We roll these up — you will get at most one message email per conversation per hour.`),
      ].join(''),
    }),
});

// ── Fallback ────────────────────────────────────────────────────────────────

export const genericEmail = define({
  id: 'generic',
  label: 'Generic notification',
  description: 'Fallback for notification types with no dedicated template yet.',
  tier: 'activity',
  category: 'project',
  sample: {
    title: 'Something happened on Influnet',
    body: 'This is the fallback layout used when a notification type has no dedicated template.',
    link: '/dashboard',
    ctaLabel: 'Open Influnet',
  },
  subject: (d) => d.title,
  render: (d, ctx) =>
    renderEmail({
      preheader: d.body?.slice(0, 140) || d.title,
      heading: d.title,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        d.body ? p(esc(d.body)) : '',
        d.link ? button(d.ctaLabel || 'Open Influnet', d.link) : '',
      ].join(''),
    }),
});

// ── Test ────────────────────────────────────────────────────────────────────

/**
 * One side answered the other: a cancellation asked for, accepted or declined,
 * a proposed change taken or refused, terms turned down.
 *
 * These were six near-identical `generic` sends with their copy written inline
 * in the route handlers, which put user-facing wording where nobody could
 * preview it — the admin console lists this registry, so anything built from
 * `generic` showed up there as lorem and could only be changed by editing an
 * API route. They share one shape: who decided, about what, optionally why,
 * and what is true now.
 */
export const decisionOutcomeEmail = define({
  id: 'decision_outcome',
  label: 'Decision on a shared item',
  description:
    'Cancellations, change requests and declined terms — someone answered, here is what changed.',
  tier: 'activity',
  category: 'project',
  sample: {
    recipientName: 'Ananya',
    actorName: 'Nomad Coffee Co.',
    subjectName: 'Winter roast launch',
    decision: 'Cancellation requested',
    // The other side's own words, when they gave any.
    note: 'The campaign budget moved to next quarter.',
    consequence:
      'Nothing is cancelled yet — the project stays open until you respond, and the record and any payments remain available either way.',
    ctaLabel: 'Open the project',
    dashboardUrl: '/dashboard/projects',
  },
  subject: (d) => `${d.decision}: ${d.subjectName}`,
  render: (d, ctx) =>
    renderEmail({
      preheader: d.consequence,
      heading: d.decision,
      kicker: d.subjectName,
      unsubscribeUrl: ctx?.unsubscribeUrl,
      reason: REASON.project,
      body: [
        p(`Hi ${esc(d.recipientName)}, <strong>${esc(d.actorName)}</strong> answered on <strong>${esc(d.subjectName)}</strong>.`),
        d.note ? quote(d.note) : '',
        p(esc(d.consequence)),
        button(d.ctaLabel, d.dashboardUrl),
      ].join(''),
    }),
});

export const deliveryTestEmail = define({
  id: 'delivery_test',
  label: 'Delivery test',
  description: 'Proves the Resend key, domain and DNS are working. Not sent by any product flow.',
  tier: 'account',
  category: 'account',
  sample: { environment: 'local', sentAt: new Date().toISOString(), dashboardUrl: '/dashboard' },
  subject: () => 'Influnet email delivery test',
  render: (d) =>
    renderEmail({
      preheader: 'If you can read this, Resend, the domain and the DNS records all work.',
      heading: 'Delivery test',
      kicker: 'If this arrived, email is wired up correctly.',
      reason: 'You triggered this from the Influnet admin email console.',
      body: [
        p(`This email exists to prove the pipeline end to end: the Resend API key is valid, the sending domain is verified, and SPF/DKIM pass.`),
        details([
          ['Environment', d.environment],
          ['Sent at', d.sentAt],
        ]),
        panel(
          {
            title: 'Worth checking before you call it done',
            text: '• It landed in <strong>Inbox</strong>, not Promotions or Spam<br />• The sender shows as <strong>Influnet</strong>, not a raw address<br />• Gmail shows no &ldquo;via&rdquo; warning next to the sender',
          },
          'neutral',
        ),
        button('Open the dashboard', d.dashboardUrl),
      ].join(''),
    }),
});

// ── Registry ────────────────────────────────────────────────────────────────

export const TEMPLATES = {
  welcome: welcomeEmail,
  verify_email: verifyEmailEmail,
  password_reset: passwordResetEmail,
  link_expired: linkExpiredEmail,
  email_change: emailChangeEmail,
  verification_code: verificationCodeEmail,
  business_approved: businessApprovedEmail,
  business_rejected: businessRejectedEmail,
  collab_request: collabRequestEmail,
  collab_accepted: collabAcceptedEmail,
  collab_declined: collabDeclinedEmail,
  collab_expiring: collabExpiringEmail,
  project_stage: projectStageEmail,
  project_action_needed: projectActionNeededEmail,
  project_completed: projectCompletedEmail,
  review_received: reviewReceivedEmail,
  payment_received: paymentReceivedEmail,
  payment_failed: paymentFailedEmail,
  unread_messages: unreadMessagesEmail,
  decision_outcome: decisionOutcomeEmail,
  generic: genericEmail,
  delivery_test: deliveryTestEmail,
} satisfies Record<string, TemplateDef<any>>;

export type TemplateId = keyof typeof TEMPLATES;

export function getTemplate(id: string): TemplateDef<any> | null {
  return (TEMPLATES as Record<string, TemplateDef<any>>)[id] ?? null;
}

/** Listing for the admin console picker. */
export function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    tier: t.tier,
    category: t.category,
    sample: t.sample,
  }));
}
