import { timingSafeEqual } from 'node:crypto';

/**
 * Scheduler routes (/api/cron/*) authenticate with `Authorization: Bearer
 * <CRON_SECRET>`. No secret configured means the route refuses everything — an
 * unauthenticated broadcast or reminder endpoint is a spam cannon.
 *
 * Constant-time comparison so the secret cannot be recovered by timing.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
