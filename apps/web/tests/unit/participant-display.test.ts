import { describe, it, expect } from 'vitest';
import {
  otherParticipant,
  participantView,
  DELETED_PARTICIPANT_LABEL,
} from '@influnet/core';

/**
 * Migration 161 made campaign_projects.owner_user_id / counterparty_user_id
 * nullable (ON DELETE SET NULL) so one person deleting their account can't
 * cascade the shared project away for the other. Every surface that renders
 * "who is this project with" must then show "Deleted account" — never crash,
 * never blank, never invent a name.
 */
describe('otherParticipant', () => {
  const OWNER_ID = '11111111-1111-1111-1111-111111111111';
  const OTHER_ID = '22222222-2222-2222-2222-222222222222';

  it('resolves a live counterparty for the owner', () => {
    const r = otherParticipant(true, OWNER_ID, OTHER_ID, { name: 'Brand Co' }, { name: 'Creator' });
    expect(r).toEqual({ id: OTHER_ID, name: 'Creator', deleted: false });
  });

  it('resolves a live owner for the counterparty viewer', () => {
    const r = otherParticipant(false, OWNER_ID, OTHER_ID, { name: 'Brand Co' }, { name: 'Creator' });
    expect(r).toEqual({ id: OWNER_ID, name: 'Brand Co', deleted: false });
  });

  it('shows Deleted account when the other FK is null (account deleted)', () => {
    const r = otherParticipant(true, OWNER_ID, null, { name: 'Brand Co' }, null);
    expect(r).toEqual({ id: null, name: DELETED_PARTICIPANT_LABEL, deleted: true });
  });

  it('shows Deleted account for the owner-side viewer too', () => {
    const r = otherParticipant(false, null, OTHER_ID, null, { name: 'Creator' });
    expect(r).toEqual({ id: null, name: DELETED_PARTICIPANT_LABEL, deleted: true });
  });

  it('treats a whitespace name as deleted rather than rendering blank', () => {
    const r = otherParticipant(true, OWNER_ID, OTHER_ID, { name: 'Brand Co' }, { name: '   ' });
    expect(r.deleted).toBe(true);
    expect(r.name).toBe(DELETED_PARTICIPANT_LABEL);
  });

  it('labels a null embed with a still-set FK as deleted (row-level hidden)', () => {
    // Should not happen with the current grants, but both null-cases render the
    // same so no caller can get this wrong.
    const r = otherParticipant(true, OWNER_ID, OTHER_ID, { name: 'Brand Co' }, null);
    expect(r.deleted).toBe(true);
  });

  it('trims the live name', () => {
    const r = otherParticipant(true, OWNER_ID, OTHER_ID, { name: 'Brand Co' }, { name: '  Creator  ' });
    expect(r.name).toBe('Creator');
  });
});

describe('participantView', () => {
  it('ships the live profile', () => {
    expect(participantView('u1', { name: 'A' })).toEqual({ id: 'u1', name: 'A', deleted: false });
  });

  it('ships Deleted account for a null id', () => {
    expect(participantView(null, null)).toEqual({ id: null, name: DELETED_PARTICIPANT_LABEL, deleted: true });
  });

  it('ships Deleted account for a missing name', () => {
    expect(participantView('u1', { name: null })).toEqual({ id: 'u1', name: DELETED_PARTICIPANT_LABEL, deleted: true });
  });
});
