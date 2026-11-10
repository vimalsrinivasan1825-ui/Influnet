/**
 * Events whose PUBLIC endpoints (/api/event-pass, /api/event-survey) are closed.
 *
 * Both routes are anonymous and keyed only by a phone number: event-pass hands
 * back the existing pass for a registered number, and event-survey's lookup
 * returns the registrant's first name, city and Instagram handle and lets the
 * caller overwrite their answers (SYSTEM_AUDIT_2026-11-05, N2). That was an
 * accepted trade for a door list while the event was open. It is not one six
 * weeks after it, so a finished event is listed here and both routes answer
 * 410 before touching the database.
 *
 * The admin screens are unaffected: they read the same rows through
 * /api/admin/event-registrations and /api/admin/event-survey, which keep their
 * own list (SURVEY_EVENTS) and need a signed-in admin.
 *
 * For the next event: add its slug to the routes' accepted lists, and put a
 * phone OTP in front of anything that returns or changes a registration.
 */
const CLOSED_EVENTS: ReadonlyMap<string, string> = new Map([
  ['silicon-nexus-s2', 'Silicon Nexus S2'], // held 25 Sep 2026
]);

/** The event's display name if its public endpoints are closed, else null. */
export function closedEventName(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;
  return CLOSED_EVENTS.get(slug.trim()) ?? null;
}
