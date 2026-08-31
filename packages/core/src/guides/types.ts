/**
 * Guided tours — the shared, platform-agnostic model.
 *
 * A guide is a short, silent, looping walkthrough of one flow: a stylised phone
 * with mock screens, a camera that pans/zooms onto real (measured) element
 * rects, and a finger that taps. Web plays it with an rAF loop; mobile mirrors
 * it with Reanimated. Both read the SAME `GuideScript` from here, so the timing
 * and choreography can never drift between platforms — only the ~dozen mock
 * screen components are implemented twice.
 *
 * The model is deliberately a flat list of `Beat`s rather than free-form
 * keyframe ladders. Each beat says: show this screen, frame this element, tap
 * that element, show this caption, for this many milliseconds. The player
 * derives every camera move, pointer path and cross-fade from that. It is the
 * smallest thing that still reads as a product video, and it keeps 18 guides
 * authorable as data.
 */

/** Guides are creator/brand facing. Admins don't get walkthroughs. */
export type GuideRole = 'business_owner' | 'influencer';

export type GuideCategory = 'get-started' | 'messaging' | 'deals' | 'account' | 'growth';

export const CATEGORY_ORDER: GuideCategory[] = [
  'get-started',
  'messaging',
  'deals',
  'account',
  'growth',
];

export const CATEGORY_LABEL: Record<GuideCategory, string> = {
  'get-started': 'Getting started',
  messaging: 'Messaging',
  deals: 'Deals & projects',
  account: 'Your account',
  growth: 'Grow & get paid',
};

/**
 * Mock screens the player can mount. Web and mobile each provide a renderer
 * keyed by this id; a guide lists the screens it uses so only those mount.
 */
export type ScreenId =
  | 'phone-home' // OS springboard: Instagram + Influnet icons
  | 'ig-profile' // Instagram: your profile, "Edit profile"
  | 'ig-edit' // Instagram: edit profile, the Links row
  | 'inf-verify' // Influnet: verify your Instagram (link card + verify button)
  | 'inf-home' // Influnet: dashboard home / action console
  | 'inf-discover' // Influnet: search + discover people
  | 'inf-profile-editor' // Influnet: edit public profile + connect socials
  | 'inf-public-profile' // Influnet: the public profile page (report/block menu)
  | 'inf-messages' // Influnet: conversation list
  | 'inf-chat' // Influnet: one conversation — composer + deal bar
  | 'inf-request' // Influnet: collab request (compose + inbox)
  | 'inf-projects' // Influnet: project list / pipeline board
  | 'inf-stage' // Influnet: stage detail — checklist + sign-off
  | 'inf-payment' // Influnet: pay securely sheet
  | 'inf-account-menu' // Influnet: account switcher (add / switch account)
  | 'inf-billing' // Influnet: upgrade to Pro
  | 'inf-activity' // Influnet: notifications + activity feed
  | 'inf-support'; // Influnet: help & feedback

/**
 * A named tap / zoom target inside a screen. Free-form: each screen component
 * documents the ids it exposes. The player measures every tagged target in the
 * mounted screens and the script references them by id.
 */
export type TargetId = string;

/** Special camera value: frame the whole phone. */
export const WIDE = 'wide' as const;

export interface Beat {
  /** Duration of this beat, in ms. */
  ms: number;
  /** Which mock screen is on during this beat. */
  screen: ScreenId;
  /** What the camera frames. A target id, `'wide'`, or omitted (keep previous). */
  focus?: TargetId | typeof WIDE;
  /** Max zoom for this beat's framing (default 2.4; ignored for `'wide'`). */
  zoom?: number;
  /** The finger travels to this target in the first part of the beat and taps it. */
  tap?: TargetId;
  /** One line naming what's happening. Drives the modal's step list too. */
  caption?: string;
  /**
   * Text that types itself into `tap` (or `focus`) during this beat — for
   * "paste your link", "type a message". The target should render an empty
   * text slot with id `${target}` the player can fill.
   */
  type?: string;
  /** Marks the celebratory finish (the verified-style burst). */
  celebrate?: boolean;
  /** Tint / highlight the focused target for the beat (a "look here" flag). */
  flag?: boolean;
}

export interface GuideScript {
  /** kebab-case, stable — used as the seen-set key and deep-link. */
  id: string;
  /** Menu + modal title, e.g. "Send a message". */
  title: string;
  /** One line under the title in the menu. */
  blurb: string;
  category: GuideCategory;
  /** Who sees this guide. Omitted = everyone. */
  roles?: GuideRole[];
  /**
   * Route prefixes that auto-run this guide on first visit. Matched with
   * `startsWith` against the current path, on BOTH platforms (web dashboard
   * paths and mobile expo-router paths are listed together).
   */
  routes: string[];
  /** The walkthrough. */
  beats: Beat[];
}

/** Distinct screens a script touches — for the player to know what to mount. */
export function screensOf(script: GuideScript): ScreenId[] {
  return [...new Set(script.beats.map((b) => b.screen))];
}

/** Absolute start time of every beat, plus the loop total. */
export function timeline(script: GuideScript): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const b of script.beats) {
    starts.push(t);
    t += b.ms;
  }
  return { starts, total: t };
}

/**
 * Caption steps for the modal's "Step n of m" strip: one entry per caption
 * change, tagged with the absolute time it appears.
 */
export function captionSteps(script: GuideScript): { at: number; label: string }[] {
  const { starts } = timeline(script);
  const out: { at: number; label: string }[] = [];
  script.beats.forEach((b, i) => {
    if (b.caption && b.caption !== out[out.length - 1]?.label) {
      out.push({ at: starts[i], label: b.caption });
    }
  });
  return out;
}
