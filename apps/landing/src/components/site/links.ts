import type { Role } from '@/lib/role';

/**
 * Where every "Log in", "Get started" and "Sign up" on the landing goes.
 *
 * Staging is the environment real users sign up on; dev is for building and
 * is wiped and reseeded. This used to default to dev, and on 2026-09-21 the
 * deploy workflow was also pointed at dev so the /join event form would post
 * there — which silently sent every login and signup link to dev as well, and
 * real people created accounts on the wrong database. Navigation and the event
 * form are now two separate settings (see EVENT_API_URL).
 *
 * NEXT_PUBLIC_* is inlined at BUILD time: changing it means a redeploy of the
 * landing (the SWA workflow has a manual trigger for exactly this).
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://staging.influnet.io';

/**
 * Where the /join event form posts registrations.
 *
 * Deliberately separate from APP_URL: an event's registrations, entry passes
 * and the admin "Event registrations" screen must all live in ONE database, and
 * the first event (silicon-nexus-s2) started collecting on dev. Moving the form
 * mid-campaign would split its passes across two databases. Repoint this, and
 * move the rows, only between events.
 */
export const EVENT_API_URL = process.env.NEXT_PUBLIC_EVENT_API_URL || 'https://dev.influnet.io';
export const SIGNUP_URL: Record<Role, string> = {
  creator: `${APP_URL}/signup/influencer`,
  business: `${APP_URL}/signup/business`,
};
export const EARLY_ACCESS_URL = `${APP_URL}/early-access`;


export const SUPPORT_EMAIL = 'support@influnet.io';

// Company profiles. Null until the real address is confirmed: the footer only
// shows an icon for a profile that is set, so nothing guessed ships to visitors.
// (A guessed LinkedIn /company/influnet is a different company; a guessed
// YouTube handle 404s; Instagram answers 200 to any handle, so it proves nothing.)
export const SOCIALS: { instagram: string | null; linkedin: string | null; youtube: string | null } = {
  instagram: null,
  linkedin: null,
  youtube: null,
};

// Store listings for the mobile app. Null until the app is published: every
// badge, the /app smart link and the arrival card switch from "coming soon"
// to live download buttons the moment these are filled in.
export const APP_STORE_URL: string | null = null;
export const PLAY_STORE_URL: string | null = null;
export const APP_LIVE = Boolean(APP_STORE_URL || PLAY_STORE_URL);

/** The one link to share for the app: sends phones to the right store. */
export const APP_LINK = '/app';
