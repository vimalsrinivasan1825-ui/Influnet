/**
 * The legal pages' content, in one file.
 *
 * ── Read this before publishing ──────────────────────────────────────────
 * Every `[[ ... ]]` marker below is a fact only the business owner knows, and
 * the pages REFUSE TO RENDER as published while any of them remain — see
 * `unresolved()` and how `app/legal/[slug]/page.tsx` uses it. That is
 * deliberate: a policy page carrying "[[LEGAL ENTITY NAME]]" in production is
 * worse than no page at all, because Razorpay's reviewer and a user reading it
 * draw the same conclusion about how seriously this is taken.
 *
 * ── What this is and is not ─────────────────────────────────────────────
 * This is a structured starting point that covers what Razorpay's merchant
 * onboarding actually checks for and what India's Consumer Protection
 * (E-Commerce) Rules 2020 require — notably a named grievance officer with a
 * response window, which is a legal obligation rather than a nicety.
 *
 * It is NOT legal advice and has not been reviewed by a lawyer. The clauses
 * that decide real money — refund eligibility, the platform's liability, who
 * owns delivered content — are business decisions. Have them reviewed before
 * you take a rupee from a stranger.
 */

export interface LegalSection {
  heading: string;
  /** Paragraphs. Markdown-free: rendered as plain paragraphs. */
  body: string[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  /** One line under the title. */
  summary: string;
  updated: string;
  sections: LegalSection[];
}

/** Facts only the business owner can supply. */
export const PLACEHOLDERS = {
  entity: '[[LEGAL ENTITY NAME]]',
  address: '[[REGISTERED ADDRESS]]',
  email: '[[SUPPORT EMAIL]]',
  grievanceName: '[[GRIEVANCE OFFICER NAME]]',
  grievanceEmail: '[[GRIEVANCE OFFICER EMAIL]]',
  jurisdiction: '[[CITY]], India',
  gst: '[[GSTIN, or delete this line if not registered]]',
} as const;

const E = PLACEHOLDERS;

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'The agreement between you and Influnet when you use the platform.',
    updated: '[[DATE PUBLISHED]]',
    sections: [
      {
        heading: 'Who we are',
        body: [
          `Influnet is operated by ${E.entity}, registered at ${E.address}. ${E.gst}. Contact us at ${E.email}.`,
          'Influnet is a marketplace that connects brands with content creators. We provide the platform on which you find each other, agree terms, track work through its stages, and settle payment.',
        ],
      },
      {
        heading: 'What we are not',
        body: [
          'We are not a party to the agreement between a brand and a creator. The scope of work, the deliverables, the deadlines and the fee are agreed between the two of you, and the resulting contract is yours, not ours.',
          'We do not employ creators, and we do not guarantee the quality, legality or timeliness of anything a creator delivers or anything a brand asks for.',
          'We do not guarantee that any campaign will produce any particular commercial result.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'You must be at least 18 years old and able to enter a binding contract.',
          'You are responsible for everything done through your account and for keeping your credentials secure. Tell us promptly at ' + E.email + ' if you believe someone else has access.',
          'One person or business, one account. Accounts may not be sold or transferred.',
          'We verify creator ownership of social accounts through a one-time code. Misrepresenting who you are, or claiming an account you do not control, is grounds for immediate removal.',
        ],
      },
      {
        heading: 'Projects, stages and sign-off',
        body: [
          'Work moves through defined stages. Most stages require BOTH parties to sign off before the project moves on — that is the mechanism that protects each of you from the other declaring something finished unilaterally.',
          'Payment stages open only when a payment is actually confirmed by our payment provider. Neither party, and no member of our staff, can tick them by hand.',
          'If a project stalls, either party may raise it with us at ' + E.email + '. We can mediate, but we cannot compel either of you to perform.',
        ],
      },
      {
        heading: 'Fees and payment',
        body: [
          'Campaign payments are made through our payment provider, Razorpay. Amounts are calculated from the terms the two parties agreed and are never taken from the browser.',
          '[[DRAFT — REVIEW BEFORE PUBLISHING: Influnet charges a platform fee of 10% of the campaign value, deducted from the amount released to the creator at final payment. The brand pays the agreed campaign amount in full; no additional fee is added on top.]]',
          '[[DRAFT — REVIEW BEFORE PUBLISHING: A creator is paid out once both parties confirm completion of the final stage. Funds are released to the creator’s registered payout method within 5–7 business days of confirmation.]]',
          'Subscription plans, where offered, are billed in advance and described at the point of purchase.',
        ],
      },
      {
        heading: 'Content and ownership',
        body: [
          '[[DRAFT — REVIEW BEFORE PUBLISHING: The creator retains copyright in the content they deliver. On confirmation of final payment, the creator grants the brand a non-exclusive, worldwide licence to use, reproduce and distribute the delivered content for the purposes agreed in the campaign brief (including paid promotion of that content), for 12 months from delivery unless the two parties agree a longer term in the brief. Any use beyond what was agreed — a different campaign, a different brand, or use after the licence period — requires the creator’s separate consent.]]',
          'You keep ownership of what you upload to your own profile. You grant us a limited licence to display it on the platform for the purpose of operating it.',
          'Creators must disclose paid partnerships as the law and the relevant platform require. That obligation is yours, not ours.',
        ],
      },
      {
        heading: 'What is not allowed',
        body: [
          'Misrepresenting your identity, audience or engagement, including buying followers or engagement.',
          'Taking a conversation off-platform in order to avoid fees, where fees apply.',
          'Harassment, discrimination, or any unlawful content.',
          'Attempting to access another account, probe our systems, or bypass rate limits and other protections.',
        ],
      },
      {
        heading: 'Suspension',
        body: [
          'We may suspend or remove an account that breaches these terms. Where we reasonably can, we will say why and give you an opportunity to respond.',
          'You may close your account at any time. Closing it does not cancel obligations you have already taken on toward another user.',
        ],
      },
      {
        heading: 'Liability',
        body: [
          'The platform is provided as-is. We do not warrant that it will be uninterrupted or error-free.',
          '[[DRAFT — REVIEW BEFORE PUBLISHING (have a lawyer confirm this fits your actual exposure): to the fullest extent permitted by law, our total liability to you arising out of or relating to your use of Influnet is limited to the platform fees we received from you in the twelve months before the claim arose.]]',
          'Nothing here limits liability that cannot lawfully be limited.',
        ],
      },
      {
        heading: 'Governing law',
        body: [
          `These terms are governed by the laws of India, and the courts at ${E.jurisdiction} have exclusive jurisdiction.`,
        ],
      },
      {
        heading: 'Changes',
        body: [
          'We may update these terms. Material changes will be notified in the app or by email before they take effect. Continuing to use Influnet after that means you accept the updated terms.',
        ],
      },
    ],
  },

  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'What we collect, why, who else sees it, and what you can ask us to do.',
    updated: '[[DATE PUBLISHED]]',
    sections: [
      {
        heading: 'Who controls your data',
        body: [
          `${E.entity}, at ${E.address}, is the data controller. Write to ${E.email} with any question about this policy.`,
        ],
      },
      {
        heading: 'What we collect',
        body: [
          'Account details: your name, email address, phone number where you give it, role, and password (stored only as a hash, never in readable form).',
          'Profile details: your bio, niche, location, rates, portfolio, and the social handles you choose to connect.',
          'Public social data: follower counts, engagement figures and recent public posts for the accounts you connect. We read only what is already public, and only for accounts you have claimed.',
          'Activity: projects, messages, requests, reviews and the stages a project has moved through.',
          'Payment records: what was paid, when, and for which project. Card details are handled by Razorpay and never reach our servers.',
          'Technical data: IP address, browser and device information, and pages visited, used for security, rate limiting and diagnosing faults.',
        ],
      },
      {
        heading: 'Why we use it',
        body: [
          'To operate the platform — matching brands with creators, running projects, and settling payments.',
          'To keep it safe: detecting fraud, abuse and automated scraping.',
          'To support you when you contact us.',
          'To understand how the product is used in aggregate, so we can improve it.',
          'To send you notifications about your own projects and, where you have not opted out, occasional product updates. Every marketing email has a working unsubscribe link.',
        ],
      },
      {
        heading: 'Who else sees it',
        body: [
          'Other users see your public profile, and the brands and creators you work with see what you share in that project.',
          'Our service providers process data on our behalf, each for one purpose: Supabase (database and authentication), Microsoft Azure (hosting), Razorpay (payments), Stream (chat), Cloudinary (images), Resend (email), Apify (public social data), Sentry (error diagnostics), PostHog (product analytics).',
          'We may disclose data where the law requires it.',
          'We do not sell your personal data.',
        ],
      },
      {
        heading: 'Where it is stored',
        body: [
          'Our application hosting (Microsoft Azure) is in the South India region. [[CONFIRM YOUR SUPABASE PROJECT REGION here — could not be verified from the codebase in this session. If any data leaves India, say so plainly.]]',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          'Account data: for as long as your account exists.',
          'Project and payment records: retained after account closure where we must, for tax and accounting purposes. [[CONFIRM THE PERIOD WITH YOUR ACCOUNTANT — commonly eight years in India.]]',
          'Technical logs: a short rolling window, used for security and diagnostics.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can ask us to show you the personal data we hold about you, correct it, delete it, or export it. Write to ' + E.email + ' and we will respond within 30 days.',
          'You can edit most of your data yourself in Settings, and you can control which sections of your profile are publicly visible.',
          'Deleting your account removes your profile. Records tied to completed transactions are retained as described above.',
        ],
      },
      {
        heading: 'Grievance officer',
        body: [
          `As required by Indian law: ${E.grievanceName}, reachable at ${E.grievanceEmail}. Complaints are acknowledged within 48 hours and resolved within 30 days.`,
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'We use cookies that are necessary to keep you signed in and to keep the platform secure. Where analytics are enabled, they are used to understand aggregate usage. You can clear cookies in your browser, though signing in will stop working without the necessary ones.',
        ],
      },
      {
        heading: 'Children',
        body: [
          'Influnet is not for anyone under 18. If we learn that we hold a child’s data, we delete it.',
        ],
      },
    ],
  },

  {
    slug: 'refunds',
    title: 'Cancellation & Refund Policy',
    summary: 'When money comes back, when it does not, and how to ask.',
    updated: '[[DATE PUBLISHED]]',
    sections: [
      {
        heading: 'What this covers',
        body: [
          'Payments made through Influnet for campaign work, and subscription fees where a paid plan applies.',
          'Because Influnet is a marketplace, a campaign payment is for work a creator performs. Once that work has been delivered and accepted, it has been performed — which is why the timing below matters.',
        ],
      },
      {
        heading: 'Cancelling before work starts',
        body: [
          'Either party may withdraw before both sides have signed off on the agreed terms. Nothing is owed.',
          '[[DRAFT — REVIEW BEFORE PUBLISHING: if an advance has already been paid and either party withdraws before the creator has started work, it is refunded to the brand in full, minus any payment-gateway processing fee that is not refundable to us.]]',
        ],
      },
      {
        heading: 'Cancelling once work is under way',
        body: [
          '[[DRAFT — REVIEW BEFORE PUBLISHING: once a creator has begun work (marked as such in the project stages), the advance is non-refundable, because it compensates work already under way. If the creator has delivered only part of the agreed work when the project is cancelled, we will mediate a fair partial payment based on the stage record.]]',
          'Where the two parties agree a different outcome between themselves, we will honour it.',
        ],
      },
      {
        heading: 'If the work is not delivered',
        body: [
          'If a creator does not deliver what was agreed, raise it at ' + E.email + ' with the project reference. We will review the project record — the agreed terms, the stage history and the sign-offs — and mediate.',
          '[[DRAFT — REVIEW BEFORE PUBLISHING: if a creator does not deliver the agreed work by the agreed deadline and has not begun it, we will refund the brand’s advance in full. If work was partly delivered, we will mediate a fair partial refund based on what the stage record shows was actually completed.]]',
        ],
      },
      {
        heading: 'Final payment',
        body: [
          'Final payment is released when both parties confirm completion. Once confirmed, it is not reversible through Influnet.',
        ],
      },
      {
        heading: 'Subscriptions',
        body: [
          'Paid plans are billed in advance. You can cancel at any time and keep access until the end of the period you have paid for.',
          '[[DRAFT — REVIEW BEFORE PUBLISHING: we do not refund part of a billing period. If you cancel, you keep access until the end of the period you already paid for, and you will not be charged again.]]',
        ],
      },
      {
        heading: 'How to request a refund',
        body: [
          `Email ${E.email} with the project reference and what happened. We acknowledge within 48 hours.`,
          'Approved refunds are returned to the original payment method within 5–7 business days. Your bank may take longer to show it.',
        ],
      },
      {
        heading: 'Chargebacks',
        body: [
          'Please talk to us before raising a chargeback with your bank — we can almost always resolve it faster. Accounts with an unresolved chargeback may be suspended while it is investigated.',
        ],
      },
    ],
  },

  {
    slug: 'contact',
    title: 'Contact',
    summary: 'How to reach a person.',
    updated: '[[DATE PUBLISHED]]',
    sections: [
      {
        heading: 'Support',
        body: [
          `${E.email} — for anything about your account, a project, or a payment.`,
          'We aim to respond within one business day.',
        ],
      },
      {
        heading: 'Registered office',
        body: [`${E.entity}`, E.address, E.gst],
      },
      {
        heading: 'Grievance officer',
        body: [
          `${E.grievanceName} — ${E.grievanceEmail}`,
          'Acknowledged within 48 hours, resolved within 30 days, as required by the Consumer Protection (E-Commerce) Rules, 2020.',
        ],
      },
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

/**
 * Every unfilled placeholder in a document.
 *
 * The page renders a loud, unmissable banner while this is non-empty, and
 * `robots` is set to noindex. A half-finished policy page that Google has
 * indexed is materially worse than a 404.
 */
export function unresolved(doc: LegalDoc): string[] {
  const found = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(/\[\[[^\]]+\]\]/g)) found.add(m[0]);
  };
  scan(doc.updated);
  for (const s of doc.sections) {
    scan(s.heading);
    s.body.forEach(scan);
  }
  return [...found];
}
