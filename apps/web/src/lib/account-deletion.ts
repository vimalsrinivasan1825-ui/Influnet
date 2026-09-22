import { createHmac } from 'node:crypto';
import { logger } from './logger';
import { deleteStreamChannels, deleteStreamUser } from './stream';

/**
 * Tombstones for deleted accounts (migration 153).
 *
 * Both delete paths — self-service DELETE /api/profile and the admin DELETE
 * /api/admin/users/[id] — call recordAccountDeletion() BEFORE
 * auth.admin.deleteUser(). After the cascade there is nothing left to
 * summarise, so a failed tombstone write stops the deletion (fail closed): the
 * "Deleted users" report must not silently miss people.
 *
 * No email/phone is stored in clear. A keyed HMAC lets a future re-signup be
 * recognised without keeping the address; the key never enters the database.
 */

export const DELETION_REASONS = [
  'not_useful',
  'privacy',
  'duplicate',
  'found_alternative',
  'too_expensive',
  'bad_experience',
  'other',
] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number] | 'admin_action';

export const DELETION_REASON_LABELS: Record<DeletionReason, string> = {
  not_useful: "It wasn't useful for me",
  privacy: 'Privacy concerns',
  duplicate: 'I have another account',
  found_alternative: 'I found another platform',
  too_expensive: 'Too expensive',
  bad_experience: 'I had a bad experience',
  other: 'Something else',
  admin_action: 'Removed by an admin',
};

function hashKey(): string | null {
  return process.env.DELETION_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/** HMAC-SHA256 of a normalised identifier, or null when there is nothing to hash. */
export function identifierHash(value: string | null | undefined, kind: 'email' | 'phone'): string | null {
  const key = hashKey();
  if (!value || !key) return null;
  const normalised =
    kind === 'email' ? value.trim().toLowerCase() : value.replace(/[^\d]/g, '').slice(-10);
  if (!normalised) return null;
  return createHmac('sha256', key).update(`${kind}:${normalised}`).digest('hex');
}

export async function recordAccountDeletion(
  serviceClient: any,
  input: {
    userId: string;
    via: 'self_web' | 'self_mobile' | 'admin';
    deletedBy: string;
    reasonCode?: string | null;
    reasonText?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await serviceClient.rpc('record_account_deletion', {
    p_user_id: input.userId,
    p_via: input.via,
    p_deleted_by: input.deletedBy,
    p_reason_code: input.reasonCode ?? null,
    p_reason_text: input.reasonText ?? null,
    p_email_hash: identifierHash(input.email, 'email'),
    p_phone_hash: identifierHash(input.phone, 'phone'),
  });
  if (error) {
    logger.error('[account-deletion] tombstone write failed', { userId: input.userId, err: error });
    return { ok: false, error: error.message ?? 'tombstone write failed' };
  }
  return { ok: true };
}

/**
 * Projects that must be settled before an account can be removed: still
 * active, not soft-deleted. Deleting mid-project would cascade the other
 * party's workspace and payment ledger away, which is the reason the mobile
 * app always told people to settle active projects first.
 */
export async function activeProjectCount(serviceClient: any, userId: string): Promise<number> {
  const { count, error } = await serviceClient
    .from('campaign_projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('manually_deleted_at', null)
    .is('deleted_at', null)
    .or(`owner_user_id.eq.${userId},counterparty_user_id.eq.${userId}`);
  // Fail closed: if we cannot tell, do not delete.
  if (error || count == null) return Number.POSITIVE_INFINITY;
  return count;
}

/**
 * The hard delete itself, shared by self-service and admin deletion.
 *
 * `auth.admin.deleteUser` cascades through `profiles` and everything that FKs
 * to it. Projects are shared records and survive (migration 161: the participant
 * columns and `project_documents.issued_by` are ON DELETE SET NULL), so the
 * other party keeps the project, its ledger and its invoices. `issued_by` is
 * still nulled here first so a database that predates 161 can still delete.
 * `conversations` has no FK to a user, so orphaned ones are swept after.
 *
 * The person is then removed from Stream Chat. That is best-effort and NEVER
 * blocks the deletion: the account is already gone, a Stream outage must not
 * leave anyone unable to delete (both app stores require it to work), and the
 * failure is returned and logged so admin can clean up rather than lost.
 */
export type HardDeleteResult =
  | { ok: true; conversationsSwept: number; stream: { userRemoved: boolean; channelsRemoved: number; error?: string } }
  | { ok: false; error: string };

export async function hardDeleteAccount(
  serviceClient: any,
  userId: string,
): Promise<HardDeleteResult> {
  const { data: parts } = await serviceClient
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);
  const convIds = [...new Set(((parts ?? []) as any[]).map((p) => p.conversation_id as string))];

  const { error: docErr } = await serviceClient
    .from('project_documents')
    .update({ issued_by: null })
    .eq('issued_by', userId);
  if (docErr) {
    logger.warn('[account-deletion] could not null project_documents.issued_by', { userId, err: docErr.message });
  }

  const { error: delErr } = await serviceClient.auth.admin.deleteUser(userId);
  if (delErr) return { ok: false, error: delErr.message ?? 'deleteUser failed' };

  let swept = 0;
  let deadConversations: string[] = [];
  if (convIds.length > 0) {
    const { data: still } = await serviceClient
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', convIds);
    const stillActive = new Set(((still ?? []) as any[]).map((p) => p.conversation_id));
    const dead = convIds.filter((c) => !stillActive.has(c));
    if (dead.length > 0) {
      await serviceClient.from('conversations').delete().in('id', dead);
      swept = dead.length;
      deadConversations = dead;
    }
  }
  // Chat comes last: only once the account is really gone.
  const streamUser = await deleteStreamUser(userId);
  const streamChannels = await deleteStreamChannels(deadConversations);
  const streamError = (!streamUser.ok ? streamUser.error : undefined) ?? streamChannels.error;
  if (streamError) {
    logger.error('[account-deletion] account deleted but Stream cleanup failed — remove the chat user by hand', {
      userId,
      err: streamError,
    });
  }
  return {
    ok: true,
    conversationsSwept: swept,
    stream: { userRemoved: streamUser.ok, channelsRemoved: streamChannels.deleted, ...(streamError ? { error: streamError } : {}) },
  };
}
