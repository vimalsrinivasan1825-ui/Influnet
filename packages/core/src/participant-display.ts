/**
 * A project participant may be GONE: migration 161 made owner_user_id and
 * counterparty_user_id nullable (ON DELETE SET NULL) so that one person
 * deleting their account can never again cascade the shared project, the
 * payment ledger or the invoices away for the other party (F2, 2026-09-18).
 *
 * Everything that renders "who is this project with" goes through here, so
 * web and mobile show the same words and the API ships the same shape:
 *   { id, name, deleted } — deleted=true with name "Deleted account".
 */

export const DELETED_PARTICIPANT_LABEL = 'Deleted account';

export type ParticipantDisplay = {
  id: string | null;
  name: string;
  /** True when the other party's account no longer exists. */
  deleted: boolean;
};

/**
 * Resolve the OTHER party for a viewer. `owner`/`counterparty` are the
 * PostgREST embedded profiles and are null in one of two cases:
 *   - the FK column itself is NULL (the participant deleted their account —
 *     migration 161), or
 *   - the embed came back empty (row-level protection).
 * Both render identically to the viewer; neither may crash or blank the UI.
 */
export function otherParticipant(
  viewerIsOwner: boolean,
  ownerId: string | null | undefined,
  counterpartyId: string | null | undefined,
  ownerProfile: { name?: string | null } | null | undefined,
  counterpartyProfile: { name?: string | null } | null | undefined,
): ParticipantDisplay {
  const otherId = viewerIsOwner ? counterpartyId : ownerId;
  const otherProfile = viewerIsOwner ? counterpartyProfile : ownerProfile;
  const name = otherProfile?.name?.trim() || null;
  if (!otherId || !name) {
    return { id: otherId ?? null, name: DELETED_PARTICIPANT_LABEL, deleted: true };
  }
  return { id: otherId, name, deleted: false };
}

/**
 * Server-side shape for API responses: every route that embeds participant
 * profiles pairs the embed with this so clients never have to guess whether a
 * missing embed means "gone" or "hidden".
 */
export function participantView(
  id: string | null | undefined,
  profile: { name?: string | null } | null | undefined,
): { id: string | null; name: string; deleted: boolean } {
  const name = profile?.name?.trim() || null;
  if (!id || !name) {
    return { id: id ?? null, name: DELETED_PARTICIPANT_LABEL, deleted: true };
  }
  return { id, name, deleted: false };
}
