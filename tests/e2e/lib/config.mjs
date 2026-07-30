// Shared config for the full E2E audit. Real accounts/handles, not placeholders.

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
// The marketing landing page lives in a separate Next app (apps/landing).
// apps/web's own "/" intentionally redirects to /login (deliberate 2026-07-18
// refactor — see git log on apps/web/src/app/page.tsx) since a logged-out
// visitor to the product app should land on login, not marketing content.
export const LANDING_URL = process.env.E2E_LANDING_URL || 'http://localhost:3001';

export const CREATOR = {
  igHandle: 'madangowri',
  igUrl: 'https://www.instagram.com/madangowri/',
  ytChannelId: 'UCY6KjrDBN_tIRFT_QNqQbRQ',
  ytHandle: '@MadanGowri',
  firstName: 'Madan',
  lastName: 'Gowri',
  username: 'madangowri',
  email: 'e2e.creator.madangowri@influnet-audit.test',
  password: 'Audit@Madan2026!',
  phone: '+91 98765 43210',
  city: 'Chennai',
  state: 'Tamil Nadu',
  gender: 'male',
  languages: ['Tamil', 'English'],
  primaryNiche: 'Entertainment',
  secondaryNiches: ['Comedy', 'Lifestyle'],
  bio: 'Tamil content creator focused on entertainment, comedy, and lifestyle.',
};

export const BUSINESS = {
  fullName: 'Arjun Test',
  companyName: 'Jupiter Media Audit',
  email: 'e2e.business.jupiter@influnet-audit.test',
  password: 'Audit@Jupiter2026!',
  phone: '+91 99887 76655',
  industry: 'Entertainment & Media',
  businessType: 'Agency',
  website: 'https://jupiter-media-audit.example.com',
  city: 'Mumbai',
  state: 'Maharashtra',
  registeredAddress: '123 Business Hub, Andheri East, Mumbai 400001',
  gst: '27AABCU1234D1ZV',
};

export const VIEWPORT = { width: 1440, height: 900 };

// Dedicated test-only admin, provisioned via scripts/create-admin.mjs
// (never the real admin@influnet.com — its on-file credentials are stale
// and we don't touch a real account's password from an automated audit).
export const TEST_ADMIN = {
  email: 'e2e.admin.audit@influnet-audit.test',
  password: 'QFih$bybiU@L87u%c$Ya=FTo',
};
