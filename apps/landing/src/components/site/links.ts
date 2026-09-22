import type { Role } from '@/lib/role';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dev.influnet.io';
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
