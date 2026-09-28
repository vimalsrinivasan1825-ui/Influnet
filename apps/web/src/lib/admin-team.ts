import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { jsonError } from './api';
import { ADMIN_MODULE_KEYS, FIELD_GROUP_KEYS } from './admin-access';

/**
 * Server helpers for the admin Team (migration 176). Authorisation lives in
 * the database — admin_grant_problem / admin_can_manage — and the routes call
 * it through the service-role client with the caller as p_actor, after
 * withAdmin has proven who the caller is.
 */

export const PermissionsSchema = z
  .record(z.string(), z.enum(['view', 'manage']))
  .refine((p) => Object.keys(p).every((k) => ADMIN_MODULE_KEYS.includes(k)), 'Unknown section');

export const HiddenFieldsSchema = z
  .array(z.string())
  .max(FIELD_GROUP_KEYS.length)
  .refine((h) => h.every((k) => FIELD_GROUP_KEYS.includes(k)), 'Unknown field group');

export const DeliverySchema = z.enum(['invite', 'password']);
export type Delivery = z.infer<typeof DeliverySchema>;

/** 24 characters, unbiased — the same generator as scripts/create-admin.mjs. */
export function strongPassword(len = 24): string {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+';
  const max = 256 - (256 % abc.length);
  let out = '';
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b >= max) continue;
      out += abc[b % abc.length];
      if (out.length === len) break;
    }
  }
  return out;
}

/**
 * How the new member gets in. An invite is a one-time set-password link, so no
 * password exists until they choose one; a password is generated here and
 * shown ONCE to the person creating the account, never stored or logged.
 */
export async function issueAccess(
  supabase: any,
  userId: string,
  email: string,
  delivery: Delivery,
  origin: string,
): Promise<{ kind: 'invite'; link: string } | { kind: 'password'; password: string } | { kind: 'failed'; reason: string }> {
  if (delivery === 'password') {
    const password = strongPassword();
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) return { kind: 'failed', reason: error.message };
    return { kind: 'password', password };
  }
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${origin}/reset-password` },
  });
  const link = data?.properties?.action_link;
  if (error || !link) return { kind: 'failed', reason: error?.message ?? 'No link returned' };
  return { kind: 'invite', link };
}

/**
 * The team functions raise user-readable messages with SQLSTATE 42501, so
 * those go straight to the screen as a 403. A missing function means the
 * migration has not reached this database.
 */
export function teamRpcError(error: { code?: string; message?: string }) {
  const msg = error.message ?? '';
  if (error.code === '42501') return jsonError(403, msg || 'Not allowed.');
  if (error.code === 'PGRST202' || /Could not find the function|does not exist/i.test(msg)) {
    return jsonError(503, 'The admin team needs database migration 176, which has not been applied here yet.', error);
  }
  return jsonError(500, 'Could not update the team.', error);
}
