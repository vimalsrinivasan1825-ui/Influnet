// The help bot's brain: a fixed knowledge base and a keyword matcher. No
// model, no network — every answer below is written by us, and the FAQ answers
// are the same checked copy the FAQ sections show. Same rule as those: no
// pricing, commission or payout-timing promises until they are decided.

import { APP_LINK, APP_LIVE, APP_URL, SIGNUP_URL, SUPPORT_EMAIL } from '@/components/site/links';
import { BUSINESS_FAQS, CREATOR_FAQS } from './faq-data';
import type { Role } from './role';

export type BotAction = { label: string; href: string; external?: boolean };

export type BotEntry = {
  id: string;
  /** The question as a chip shows it. */
  q: string;
  a: string;
  /** Words or phrases that point at this answer, beyond the question itself. */
  keys: string[];
  /** Omitted = answers both sides. */
  roles?: Role[];
  actions?: BotAction[];
};

const CONTACT: BotAction = { label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}`, external: true };

// Extra keywords for each FAQ answer, keyed by its question.
const FAQ_KEYS: Record<string, string[]> = {
  'Is Influnet free for creators?': ['free', 'cost', 'price', 'pay to join', 'charge', 'fee', 'money'],
  'Do I have to give my Instagram password?': ['password', 'safe', 'security', 'login instagram', 'hack', 'access'],
  'How do I know a brand is genuine?': ['genuine', 'real brand', 'fake', 'scam', 'trust', 'unverified', 'legit', 'verified brand'],
  'How do payments work?': ['payment', 'paid', 'razorpay', 'advance', 'money', 'payout', 'upi'],
  'Which platforms can I connect?': ['platform', 'youtube', 'facebook', 'snapchat', 'twitter', 'connect', 'social'],
  'Can I find brands myself?': ['find brand', 'campaign', 'apply', 'browse', 'opportunity', 'deal', 'collab'],
  'How do I know a creator is real?': ['real creator', 'fake', 'genuine', 'verified', 'follower', 'engagement', 'bot'],
  'Why does my business need to be reviewed?': ['review', 'approval', 'approved', 'pending', 'verify business', 'unverified'],
  'Will I get invoices?': ['invoice', 'gst', 'receipt', 'bill', 'tax'],
  'Can creators come to me?': ['campaign', 'post campaign', 'applications', 'apply', 'open campaign'],
  'What if a collaboration goes wrong?': ['wrong', 'dispute', 'problem', 'issue', 'cancel', 'report', 'block', 'complaint'],
};

const fromFaq = (items: { q: string; a: string }[], role: Role, prefix: string): BotEntry[] =>
  items.map((f, i) => ({ id: `${prefix}-${i}`, q: f.q, a: f.a, keys: FAQ_KEYS[f.q] ?? [], roles: [role] }));

export const ENTRIES: BotEntry[] = [
  {
    id: 'what',
    q: 'What is Influnet?',
    a: 'Influnet is where Indian brands and verified creators find each other, agree terms and deliver campaigns, with every step on the record: requests, chat, written terms, payments and sign-offs in one place.',
    keys: ['what is', 'about', 'influnet', 'explain', 'purpose', 'who are you', 'what do you do'],
  },
  {
    id: 'start-creator',
    q: 'How do I get started?',
    a: 'Create your free profile, connect your socials and add your Influnet profile link to your Instagram bio. That link proves the account is yours, and brands reach you through it instead of your DMs.',
    keys: ['start', 'sign up', 'signup', 'register', 'join', 'create account', 'create profile', 'onboard', 'begin'],
    roles: ['creator'],
    actions: [{ label: 'Create your free profile', href: SIGNUP_URL.creator, external: true }],
  },
  {
    id: 'start-business',
    q: 'How do I get started?',
    a: 'Create a business account and add your details. The Influnet team reviews every business. While you wait you can already send requests to creators; publishing an open campaign needs an approved business.',
    keys: ['start', 'sign up', 'signup', 'register', 'join', 'create account', 'onboard', 'begin'],
    roles: ['business'],
    actions: [{ label: 'Create a business account', href: SIGNUP_URL.business, external: true }],
  },
  {
    id: 'how',
    q: 'How does a collaboration work?',
    a: 'A request turns into a project once both sides agree. The project then tracks every step: terms, the advance payment, drafts, review and the final payment. Most steps need both sides to sign off before it moves on, and it cannot pass a payment step until the payment is confirmed.',
    keys: ['how it works', 'how does', 'process', 'steps', 'stage', 'project', 'workflow', 'collaboration', 'sign off', 'signoff'],
  },
  {
    id: 'app',
    q: 'Is there a mobile app?',
    a: APP_LIVE
      ? 'Yes. Influnet is on iOS and Android, with notifications for new requests, messages and sign-offs. Your web account works in the app.'
      : 'Yes, the Influnet app for iOS and Android is on its way to the stores. It brings your requests, messages and projects to your phone with notifications. Your web account will work in it the day it lands.',
    keys: ['app', 'mobile', 'android', 'iphone', 'ios', 'download', 'play store', 'app store', 'phone', 'install'],
    actions: [{ label: APP_LIVE ? 'Get the app' : 'See the app', href: APP_LINK }],
  },
  {
    id: 'pricing-business',
    q: 'How much does it cost?',
    a: 'We share current plans for brands directly rather than on this page, so you always get the up-to-date version. Write to us and the team will walk you through it.',
    keys: ['price', 'pricing', 'cost', 'plan', 'subscription', 'charge', 'fee', 'commission', 'pro', 'premium', 'how much'],
    roles: ['business'],
    actions: [CONTACT],
  },
  {
    id: 'verify-me',
    q: 'How do I get verified?',
    a: 'Add your Influnet profile link (influnet.io/your-username) to your Instagram bio. Once we see it there, your account is proven to be yours. Keep it there: it is also how brands find you. We never ask for your password.',
    keys: ['verify', 'verified', 'badge', 'blue tick', 'tick', 'bio', 'bio link', 'link in bio', 'profile link', 'ownership', 'prove'],
    roles: ['creator'],
  },
  {
    id: 'login',
    q: 'I can’t log in',
    a: 'You can log in on the web app with the email you signed up with. If you have forgotten your password, use “Forgot password” on the login page. Still stuck? Write to us.',
    keys: ['login', 'log in', 'sign in', 'signin', 'forgot password', 'reset password', 'forgot', 'reset', 'locked', 'otp', 'cant login'],
    actions: [{ label: 'Go to log in', href: `${APP_URL}/login`, external: true }, CONTACT],
  },
  {
    id: 'delete',
    q: 'How do I delete my account?',
    a: 'You can delete your account from your settings, as long as no funded collaboration is still in progress. You can also ask us for an export of your data, or to delete it, by email.',
    keys: ['delete', 'remove account', 'close account', 'deactivate', 'my data', 'export data', 'gdpr'],
    actions: [{ label: 'Privacy Policy', href: '/privacy' }, CONTACT],
  },
  {
    id: 'legal',
    q: 'Where are your terms and policies?',
    a: 'Our Terms of Service, Privacy Policy and Refund & Cancellation policy are all public.',
    keys: ['terms', 'policy', 'privacy', 'legal', 'refund', 'money back', 'cancellation', 'conditions', 'grievance'],
    actions: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Refunds', href: '/refunds' },
    ],
  },
  {
    id: 'human',
    q: 'Talk to a person',
    a: `Of course. Email ${SUPPORT_EMAIL} or use the form at the bottom of this page, and someone from the Influnet team will get back to you.`,
    keys: ['human', 'person', 'agent', 'support', 'contact', 'talk', 'call', 'email', 'help me', 'someone', 'team', 'customer care'],
    actions: [CONTACT],
  },
  ...fromFaq(CREATOR_FAQS, 'creator', 'cf'),
  ...fromFaq(BUSINESS_FAQS, 'business', 'bf'),
];

/** The chips shown when the chat opens, in order. */
export const STARTERS: Record<Role, string[]> = {
  creator: ['what', 'start-creator', 'cf-0', 'cf-1', 'cf-3', 'app'],
  business: ['what', 'start-business', 'bf-0', 'bf-2', 'pricing-business', 'app'],
};

export const byId = (id: string) => ENTRIES.find((e) => e.id === id);

// ── Matching ───────────────────────────────────────────────────────────────

const STOP = new Set(
  'a an the i me my we you your is are am be do does did can could how what why when where which who to of in on for and or it its this that with as at by from about there any will would should have has get'.split(
    ' ',
  ),
);

// Everyday words people type, folded onto the words the entries use.
const SYNONYMS: Record<string, string> = {
  cost: 'price', costs: 'price', pricing: 'price', charges: 'price', fees: 'price', paisa: 'money',
  pay: 'payment', paying: 'payment', payments: 'payment', paid: 'payment', payout: 'payment',
  mobile: 'app', android: 'app', iphone: 'app', ios: 'app', playstore: 'app', appstore: 'app',
  signup: 'join', register: 'join', registration: 'join', onboard: 'join',
  signin: 'login', logon: 'login',
  brands: 'brand', company: 'brand', companies: 'brand',
  influencer: 'creator', influencers: 'creator', creators: 'creator', youtuber: 'creator',
  fake: 'genuine', legit: 'genuine', scam: 'genuine', real: 'genuine',
  tick: 'badge', verification: 'verify', verified: 'verify',
  invoices: 'invoice', bill: 'invoice', bills: 'invoice',
  collab: 'collaboration', collabs: 'collaboration', deal: 'collaboration', deals: 'collaboration',
};

const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => stem(SYNONYMS[w] ?? w));
}

const norm = (text: string) => ` ${tokens(text).join(' ')} `;

function score(entry: BotEntry, input: string, words: Set<string>, role: Role) {
  let s = 0;
  // Keys that fold to the same words (fake / legit / scam) count once.
  for (const k of new Set(entry.keys.map((key) => norm(key).trim()))) {
    if (!k) continue;
    if (k.includes(' ')) {
      if (input.includes(` ${k} `)) s += 4;
    } else if (words.has(k)) {
      s += 2;
    }
  }
  for (const w of new Set(tokens(entry.q))) if (words.has(w)) s += 1;
  if (!entry.roles) s += 0.25;
  else if (entry.roles.includes(role)) s += 0.5;
  // The other side's answer only wins when nothing on this side comes close.
  else s -= 4;
  return s;
}

const GREETING = /^(hi+|hey+|hello+|hii+|yo|namaste|good (morning|afternoon|evening))\b/i;
const THANKS = /\b(thanks|thank you|thx|ty|great|cool|ok+|okay|got it)\b/i;

export type BotReply =
  | { kind: 'answer'; entry: BotEntry; related: BotEntry[] }
  | { kind: 'greeting' | 'thanks' | 'fallback'; related: BotEntry[] };

export function answer(text: string, role: Role): BotReply {
  const starters = STARTERS[role].map(byId).filter(Boolean) as BotEntry[];
  const clean = text.trim();
  const words = new Set(tokens(clean));

  if (GREETING.test(clean) && words.size <= 2) return { kind: 'greeting', related: starters.slice(0, 4) };
  if (THANKS.test(clean) && words.size <= 3) return { kind: 'thanks', related: [] };

  const input = norm(clean);
  const ranked = ENTRIES.map((e) => ({ e, s: score(e, input, words, role) }))
    .filter((r) => r.s >= 2)
    .sort((a, b) => b.s - a.s);

  if (!ranked.length) return { kind: 'fallback', related: starters.slice(0, 4) };

  const best = ranked[0].e;
  const related = ranked
    .slice(1)
    .map((r) => r.e)
    .filter((e) => e.q !== best.q && (!e.roles || e.roles.includes(role)))
    .slice(0, 2);
  return { kind: 'answer', entry: best, related };
}
