// HikerAPI client — a thin, typed wrapper over api.hikerapi.com used to fetch
// PUBLIC Instagram account data as verification signals.
//
// Design rules:
//  - SERVER-ONLY. The access key (HIKERAPI_ACCESS_KEY) must never reach the client.
//  - Only ever called against USER-SUBMITTED handles (the account being verified
//    is the user's own). We read public profile fields + recency, never scrape
//    private data or store raw page dumps.
//  - Every failure is typed and non-fatal to the caller: verification degrades to
//    human review rather than crashing (see verification-live.ts). In particular a
//    402 (account out of credit) or 401 (bad key) must NOT block product access.
//
// Endpoints (from the HikerAPI OpenAPI spec):
//   GET /v1/user/by/username?username=  -> User object
//   GET /v1/user/medias?user_id=&amount= -> [Media] (recency)

import { logger } from './logger';

const DEFAULT_BASE_URL = 'https://api.hikerapi.com';
const REQUEST_TIMEOUT_MS = 15_000;

export type HikerErrorKind =
  | 'unauthorized' // 401 — key missing/invalid
  | 'insufficient_funds' // 402 — HikerAPI account has no balance
  | 'not_found' // 404 — the handle does not resolve to an account
  | 'rate_limited' // 429
  | 'network' // timeout / DNS / fetch failure
  | 'unknown'; // anything else

export class HikerApiError extends Error {
  kind: HikerErrorKind;
  status?: number;
  constructor(kind: HikerErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'HikerApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Normalised subset of the HikerAPI `User` object we actually use. */
export interface HikerInstagramUser {
  pk: string;
  username: string | null;
  fullName: string | null;
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  isVerified: boolean; // Instagram's OWN blue-check — a strong trust signal
  isPrivate: boolean;
  isBusiness: boolean;
  biography: string | null;
  externalUrl: string | null;
  publicEmail: string | null;
  categoryName: string | null;
  // Some providers (e.g. Apify) return recency inline with the profile; when set
  // the caller can skip the separate getLastPostDaysAgo() call. HikerAPI leaves
  // this undefined and exposes recency via getLastPostDaysAgo().
  lastPostDaysAgo?: number | null;
}

/** Is a HikerAPI key configured? When false, live checks are skipped entirely. */
export function isHikerConfigured(): boolean {
  return Boolean(process.env.HIKERAPI_ACCESS_KEY?.trim());
}

function baseUrl(): string {
  return (process.env.HIKERAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/** Strip a leading @, surrounding whitespace, and a trailing slash from a handle. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    // tolerate someone pasting a full instagram.com/<handle> URL
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .trim();
  return cleaned.length ? cleaned : null;
}

async function hikerGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.HIKERAPI_ACCESS_KEY?.trim();
  if (!key) throw new HikerApiError('unauthorized', 'HIKERAPI_ACCESS_KEY is not configured');

  const url = new URL(`${baseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-access-key': key },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err: any) {
    throw new HikerApiError('network', err?.name === 'AbortError' ? 'HikerAPI request timed out' : `HikerAPI network error: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new HikerApiError('unauthorized', 'HikerAPI rejected the access key (401)', 401);
  if (res.status === 402) throw new HikerApiError('insufficient_funds', 'HikerAPI account has no balance (402) — top up at https://hikerapi.com/billing', 402);
  if (res.status === 404) throw new HikerApiError('not_found', 'Account not found (404)', 404);
  if (res.status === 429) throw new HikerApiError('rate_limited', 'HikerAPI rate limit hit (429)', 429);
  if (!res.ok) throw new HikerApiError('unknown', `HikerAPI returned ${res.status}`, res.status);

  return (await res.json()) as T;
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch a public Instagram account by username. Returns the normalised user, or
 * `null` when the handle does not resolve (404). Throws HikerApiError for auth,
 * billing, rate-limit, and network failures so the caller can decide how to
 * degrade (it never crashes verification — see verification-live.ts).
 */
export async function getInstagramUser(username: string): Promise<HikerInstagramUser | null> {
  const handle = normalizeHandle(username);
  if (!handle) return null;

  let raw: any;
  try {
    raw = await hikerGet<any>('/v1/user/by/username', { username: handle });
  } catch (err) {
    if (err instanceof HikerApiError && err.kind === 'not_found') return null;
    throw err;
  }

  // HikerAPI occasionally wraps the user under a `user` key; tolerate both.
  const u = raw?.user ?? raw;
  if (!u || (u.pk == null && u.username == null)) return null;

  return {
    pk: String(u.pk ?? ''),
    username: u.username ?? null,
    fullName: u.full_name ?? null,
    followerCount: toNum(u.follower_count),
    followingCount: toNum(u.following_count),
    mediaCount: toNum(u.media_count),
    isVerified: Boolean(u.is_verified),
    isPrivate: Boolean(u.is_private),
    isBusiness: Boolean(u.is_business),
    biography: u.biography ?? null,
    externalUrl: u.external_url ?? null,
    publicEmail: u.public_email ?? null,
    categoryName: u.category_name ?? u.business_category_name ?? null,
  };
}

/**
 * Best-effort recency: days since the account's most recent post. Returns null
 * on ANY problem (missing pk, error, private account) — recency is a secondary
 * signal and must never break a verification run.
 */
export async function getLastPostDaysAgo(userId: string): Promise<number | null> {
  if (!userId) return null;
  try {
    const medias = await hikerGet<any[]>('/v1/user/medias', { user_id: userId, amount: '1' });
    const first = Array.isArray(medias) ? medias[0] : null;
    const ts = toNum(first?.taken_at_ts);
    if (!ts) return null;
    const days = (Date.now() / 1000 - ts) / 86_400;
    return days >= 0 ? Math.round(days) : null;
  } catch (err) {
    logger.warn('HikerAPI recency lookup failed (non-fatal)', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
