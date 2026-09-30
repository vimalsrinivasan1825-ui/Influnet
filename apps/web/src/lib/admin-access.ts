/**
 * Admin team access (migration 176): who may see which console section, and
 * which fields are hidden from them.
 *
 *   super  profiles.is_super_admin — every section, including the developer
 *          ones below, and no field is ever hidden.
 *   admin  created by a super admin; holds the sections it was granted. With
 *          `team` at manage it creates STAFF, never another admin.
 *   staff  created by a super admin or an admin; holds what it was granted.
 *
 * A section is held at 'view' (GET) or 'manage' (every other method).
 *
 * This file is the catalog both halves read: `withAdmin` resolves every
 * /api/admin/* request to a section here and refuses it server-side; the
 * sidebar and page gate read it to decide what to draw. It imports nothing
 * server-only, so the browser can use it too.
 *
 * The section and field-group keys must match admin_delegable_modules() and
 * admin_field_groups() in migration 176 — tests/unit/admin-access.test.ts
 * fails if they drift. Adding a section: add it here AND in a new migration
 * that replaces admin_delegable_modules().
 */

export type AdminLevel = 'view' | 'manage';
export type AdminTierName = 'super' | 'admin' | 'staff';

export interface AdminModule {
  key: string;
  label: string;
  /** Sidebar group it belongs to — the Team page lists sections the same way. */
  group: string;
  description: string;
  /** Console pages (prefix match on path segments). */
  pages: string[];
  /** /api/admin/<prefix> routes (prefix match on path segments). */
  api: string[];
  /** /api/admin/insights/<module> reports. */
  insights: string[];
}

export const ADMIN_MODULES: AdminModule[] = [
  // ── Workspace ────────────────────────────────────────────────────────────
  { key: 'overview', label: 'Overview', group: 'Workspace', description: 'Headline counts on the console home.',
    pages: ['/dashboard/admin'], api: ['dashboard'], insights: [] },
  { key: 'founder', label: 'Founder dashboard', group: 'Workspace', description: 'Growth, revenue and funnel summary.',
    pages: ['/dashboard/admin/founder'], api: [], insights: ['founder'] },
  { key: 'activity', label: 'Live activity', group: 'Workspace', description: 'Real-time feed of what users are doing.',
    pages: ['/dashboard/admin/activity'], api: ['activity'], insights: [] },
  { key: 'analytics', label: 'Analytics & metrics', group: 'Workspace', description: 'Analytics, daily metrics and product analytics.',
    pages: ['/dashboard/admin/analytics', '/dashboard/admin/metrics', '/dashboard/admin/product'], api: ['analytics'], insights: ['daily', 'product'] },
  { key: 'customers', label: 'Customers', group: 'Workspace', description: 'Customer tracking, incomplete signups, deleted users.',
    pages: ['/dashboard/admin/customers', '/dashboard/admin/incomplete', '/dashboard/admin/deleted'], api: [], insights: ['customers', 'incomplete', 'deleted'] },
  { key: 'app_activity', label: 'App activity', group: 'Workspace', description: 'Mobile app versions and usage.',
    pages: ['/dashboard/admin/app'], api: [], insights: ['app'] },
  // ── Marketplace ──────────────────────────────────────────────────────────
  { key: 'campaigns', label: 'Campaigns', group: 'Marketplace', description: 'Review, approve and remove campaigns.',
    pages: ['/dashboard/admin/campaigns'], api: ['campaigns'], insights: [] },
  { key: 'projects', label: 'Projects', group: 'Marketplace', description: 'Every project and its stage.',
    pages: ['/dashboard/admin/projects'], api: ['projects'], insights: [] },
  { key: 'requests', label: 'Requests', group: 'Marketplace', description: 'Collaboration requests between accounts.',
    pages: ['/dashboard/admin/collabs'], api: ['collabs'], insights: [] },
  { key: 'marketplace', label: 'Marketplace analytics', group: 'Marketplace', description: 'Marketplace, engagement and match-system reports.',
    pages: ['/dashboard/admin/marketplace', '/dashboard/admin/engagement', '/dashboard/admin/search'], api: [], insights: ['marketplace', 'engagement', 'search'] },
  // ── Payments ─────────────────────────────────────────────────────────────
  { key: 'payments', label: 'Payments', group: 'Payments', description: 'The payments ledger.',
    pages: ['/dashboard/admin/payments'], api: [], insights: ['payments'] },
  { key: 'subscribers', label: 'Pro subscribers', group: 'Payments', description: 'Pro subscriptions and renewals.',
    pages: ['/dashboard/admin/subscribers'], api: [], insights: ['subscribers'] },
  // ── Engagement ───────────────────────────────────────────────────────────
  { key: 'broadcasts', label: 'Broadcasts', group: 'Engagement', description: 'Push, in-app and email broadcasts to real users.',
    pages: ['/dashboard/admin/broadcasts'], api: ['broadcasts'], insights: ['push_devices'] },
  { key: 'leads', label: 'Leads', group: 'Engagement', description: 'Sales CRM leads and notes.',
    pages: ['/dashboard/admin/leads'], api: ['leads'], insights: ['leads'] },
  { key: 'early_access', label: 'Early access', group: 'Engagement', description: 'Waitlist and early-access sign-ups.',
    pages: ['/dashboard/admin/early-access'], api: ['early-access'], insights: ['early_access'] },
  { key: 'events', label: 'Events', group: 'Engagement', description: 'Event registrations and the event survey.',
    pages: ['/dashboard/admin/event-registrations', '/dashboard/admin/event-survey'], api: ['event-registrations', 'event-survey'], insights: ['event_registrations'] },
  // ── People & support ─────────────────────────────────────────────────────
  { key: 'approvals', label: 'Approvals', group: 'People & support', description: 'Business approvals and creator verification.',
    pages: ['/dashboard/admin/approvals'], api: ['businesses', 'verifications'], insights: [] },
  { key: 'users', label: 'Users', group: 'People & support', description: 'Every account: view, edit, delete.',
    pages: ['/dashboard/admin/users'], api: ['users'], insights: [] },
  { key: 'support', label: 'Support', group: 'People & support', description: 'Support tickets.',
    pages: ['/dashboard/admin/support'], api: ['support'], insights: [] },
  { key: 'moderation', label: 'Reports', group: 'People & support', description: 'User reports and moderation.',
    pages: ['/dashboard/admin/reports'], api: ['reports'], insights: [] },
  { key: 'feedback', label: 'Feedback', group: 'People & support', description: 'In-app feedback.',
    pages: ['/dashboard/admin/feedback'], api: ['feedback'], insights: [] },
  // ── Reports & logs ───────────────────────────────────────────────────────
  { key: 'report_builder', label: 'Report builder', group: 'Reports & logs', description: 'Build and export custom datasets.',
    pages: ['/dashboard/admin/report-builder'], api: ['reports/dataset', 'reports/saved'], insights: [] },
  { key: 'errors', label: 'Error log', group: 'Reports & logs', description: 'Client and server errors.',
    pages: ['/dashboard/admin/errors'], api: ['errors'], insights: [] },
  { key: 'otp', label: 'OTP logs', group: 'Reports & logs', description: 'Phone verification attempts.',
    pages: ['/dashboard/admin/otp'], api: [], insights: ['otp'] },
  // ── Team ─────────────────────────────────────────────────────────────────
  { key: 'team', label: 'Team', group: 'Team', description: 'Create and manage staff. Admins only — never staff.',
    pages: ['/dashboard/admin/team'], api: ['team'], insights: [] },
];

export type AdminModuleKey = string;

export const ADMIN_MODULE_KEYS: string[] = ADMIN_MODULES.map((m) => m.key);

/** Technical sections: super admin only, never delegable. */
export const DEVELOPER_PAGES = [
  '/dashboard/admin/health', '/dashboard/admin/vendors', '/dashboard/admin/observability',
  '/dashboard/admin/rate-limits', '/dashboard/admin/emails', '/dashboard/admin/audit',
  '/dashboard/admin/issues',
];
export const DEVELOPER_API = ['health', 'vendors', 'observability', 'rate-limits', 'emails', 'audit', 'issues'];

/** Routes every active team member needs regardless of sections. */
const OPEN_API = ['tier'];

// ── Field groups ─────────────────────────────────────────────────────────────

export interface FieldGroup {
  key: string;
  label: string;
  description: string;
  /** Matches a JSON key (at any depth) that belongs to this group. */
  match: RegExp;
}

export const FIELD_GROUPS: FieldGroup[] = [
  { key: 'email', label: 'Email addresses', description: 'Every email address on accounts, leads and logs.',
    match: /^(?:.*_)?emails?(?:_hash)?$/ },
  { key: 'phone', label: 'Phone numbers', description: 'Phone and WhatsApp numbers, including OTP logs.',
    match: /^(?:.*_)?(?:phones?|mobile|whatsapp)(?:_number|_digits|_hash)?$/ },
  { key: 'money', label: 'Money', description: 'Payment amounts, GMV, revenue, budgets and prices.',
    match: /(?:^|_)(?:paise|amount|gmv|revenue|mrr|budget|price|payout|earned|fee|fees)(?:_|$)/ },
  { key: 'location', label: 'Location', description: 'City, location and address.',
    match: /^(?:.*_)?(?:locations?|city|cities|address|pincode|pin_code|latitude|longitude)$/ },
  { key: 'device', label: 'Device & network', description: 'IP addresses, user agents and push tokens.',
    match: /^(?:.*_)?(?:ip|ip_address|user_agent|push_token|device_id|device_token)$/ },
];

export const FIELD_GROUP_KEYS: string[] = FIELD_GROUPS.map((g) => g.key);

// ── Access ───────────────────────────────────────────────────────────────────

export interface AdminAccess {
  tier: AdminTierName;
  /** Section → level. Empty for a super admin, who holds everything. */
  permissions: Record<string, AdminLevel>;
  hiddenFields: string[];
}

export const SUPER_ACCESS: AdminAccess = { tier: 'super', permissions: {}, hiddenFields: [] };

const LEVEL_RANK: Record<string, number> = { view: 1, manage: 2 };
const rank = (l: string | null | undefined) => (l ? LEVEL_RANK[l] ?? 0 : 0);

export function levelFor(access: AdminAccess, module: string): AdminLevel | null {
  if (access.tier === 'super') return 'manage';
  return access.permissions[module] ?? null;
}

export function requiredLevel(method: string): AdminLevel {
  return method === 'GET' || method === 'HEAD' ? 'view' : 'manage';
}

export function allows(access: AdminAccess, module: string, level: AdminLevel): boolean {
  return rank(levelFor(access, module)) >= rank(level);
}

/** Prefix match on whole path segments: 'reports' matches 'reports/1', not 'reportsx'. */
function segmentPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export type ApiSection =
  | { kind: 'module'; module: string }
  | { kind: 'developer' }
  | { kind: 'open' }
  | { kind: 'unknown' };

/**
 * Which section an /api/admin/* path belongs to. The longest matching prefix
 * wins, so `reports/dataset` is the report builder while `reports/12` is
 * moderation. An unmapped path is `unknown` — refused for everyone but a super
 * admin, so a new route is closed until someone places it in a section.
 */
export function sectionForApiPath(pathname: string): ApiSection {
  const path = pathname.replace(/^\/api\/admin\/?/, '').replace(/\/+$/, '');

  if (path.startsWith('insights/')) {
    const name = path.slice('insights/'.length).split('/')[0];
    const mod = ADMIN_MODULES.find((m) => m.insights.includes(name));
    return mod ? { kind: 'module', module: mod.key } : { kind: 'unknown' };
  }
  if (OPEN_API.some((p) => segmentPrefix(path, p))) return { kind: 'open' };
  if (DEVELOPER_API.some((p) => segmentPrefix(path, p))) return { kind: 'developer' };

  let best: { module: string; len: number } | null = null;
  for (const m of ADMIN_MODULES) {
    for (const p of m.api) {
      if (segmentPrefix(path, p) && (!best || p.length > best.len)) best = { module: m.key, len: p.length };
    }
  }
  return best ? { kind: 'module', module: best.module } : { kind: 'unknown' };
}

/** Which section a console page belongs to; `/dashboard/admin` itself is Overview. */
export function sectionForPage(pathname: string): ApiSection {
  const path = pathname.replace(/\/+$/, '');
  if (DEVELOPER_PAGES.some((p) => segmentPrefix(path, p))) return { kind: 'developer' };
  if (path === '/dashboard/admin') return { kind: 'module', module: 'overview' };
  let best: { module: string; len: number } | null = null;
  for (const m of ADMIN_MODULES) {
    for (const p of m.pages) {
      if (p === '/dashboard/admin') continue;
      if (segmentPrefix(path, p) && (!best || p.length > best.len)) best = { module: m.key, len: p.length };
    }
  }
  return best ? { kind: 'module', module: best.module } : { kind: 'unknown' };
}

/** May this member open this console page at all (view or better)? */
export function canOpenPage(access: AdminAccess, pathname: string): boolean {
  if (access.tier === 'super') return true;
  const s = sectionForPage(pathname);
  return s.kind === 'module' && allows(access, s.module, 'view');
}

// ── Delegation (mirror of admin_grant_problem in migration 176) ─────────────
// The database is the enforcement. This copy exists so the Team page can grey
// out what the signed-in member may not grant, and so the API can refuse
// before it creates an auth user.

export function grantProblem(
  actor: AdminAccess,
  tier: 'admin' | 'staff',
  permissions: Record<string, string>,
  hidden: string[],
): string | null {
  for (const [k, v] of Object.entries(permissions)) {
    if (!ADMIN_MODULE_KEYS.includes(k) || !(v === 'view' || v === 'manage')) {
      return 'One of the sections or access levels is not recognised.';
    }
  }
  if (hidden.some((h) => !FIELD_GROUP_KEYS.includes(h))) return 'One of the hidden field groups is not recognised.';
  if (tier === 'staff' && 'team' in permissions) return 'Staff accounts cannot manage the team.';

  const actorRank = actor.tier === 'super' ? 3 : actor.tier === 'admin' ? 2 : 1;
  const targetRank = tier === 'admin' ? 2 : 1;
  if (actorRank <= targetRank) {
    return actorRank === 2 ? 'Admins can create staff, not other admins.' : 'Your account cannot create or change team members.';
  }
  if (actor.tier === 'super') return null;

  if (!allows(actor, 'team', 'manage')) return 'Your account does not have permission to manage the team.';
  for (const [k, v] of Object.entries(permissions)) {
    if (rank(v) > rank(actor.permissions[k])) {
      return `You cannot grant ${v} access to "${k}" — your own access is ${actor.permissions[k] ?? 'none'}.`;
    }
  }
  if (actor.hiddenFields.some((h) => !hidden.includes(h))) return 'You cannot show fields that are hidden from you.';
  return null;
}

/** Tiers this member may create: a super admin → admin + staff, an admin with team → staff. */
export function creatableTiers(actor: AdminAccess): Array<'admin' | 'staff'> {
  if (actor.tier === 'super') return ['admin', 'staff'];
  if (actor.tier === 'admin' && allows(actor, 'team', 'manage')) return ['staff'];
  return [];
}

// ── Field hiding ─────────────────────────────────────────────────────────────

export const HIDDEN_VALUE = 'Hidden';

function hiddenMatchers(hidden: string[]): RegExp[] {
  return FIELD_GROUPS.filter((g) => hidden.includes(g.key)).map((g) => g.match);
}

/**
 * Shape-preserving mask: a string reads "Hidden", a number or boolean becomes
 * null, a list becomes empty. Keys are kept, so a screen that reads
 * `row.email` renders "Hidden" instead of crashing on a missing property.
 */
function mask(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'string') return HIDDEN_VALUE;
  if (Array.isArray(v)) return [];
  if (typeof v === 'object') return {};
  return null;
}

export function redactHidden<T>(value: T, hidden: string[]): T {
  if (!hidden.length) return value;
  const matchers = hiddenMatchers(hidden);
  if (!matchers.length) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        out[k] = matchers.some((re) => re.test(k.toLowerCase())) ? mask(child) : walk(child);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
