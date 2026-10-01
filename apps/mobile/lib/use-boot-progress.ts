/**
 * What the launch screen is waiting for, as a progress figure and a sentence.
 *
 * The splash used to hold for the session and the profile, then hand over to
 * Home, which only THEN started loading — so a launch was a logo, then a
 * skeleton, then the screen. Now Home's data is loaded here too, in parallel
 * with the profile, and the splash only leaves once there is a real screen to
 * reveal. On a launch after the first, both usually come from last launch's
 * snapshot (lib/boot-cache.ts) and the splash leaves as soon as its own short
 * intro has played.
 *
 * Milestones, signed in:   fonts + session read → profile → home data → done
 * Signed out:              fonts + session read → done (Welcome needs nothing)
 *
 * The bar moves to each milestone's figure and creeps on between them
 * (components/brand/splash.tsx), so it never sits still on a slow network.
 */
import { useEffect, useState } from 'react';
import { useSession } from './session';
import { warmHome } from './home-data';

/** Home gets this long after the profile before the splash gives up on it. */
const HOME_WAIT_MS = 7000;
/** A step taking longer than this gets the "slow connection" line. */
const SLOW_AFTER_MS = 5000;

export interface BootProgress {
  progress: number;
  status: string;
  /** Everything the first screen needs is in hand. */
  done: boolean;
}

export function useBootProgress(fontsReady: boolean): BootProgress {
  const ready = useSession((s) => s.ready);
  const userId = useSession((s) => s.session?.user.id ?? null);
  const hasProfile = useSession((s) => !!s.profile);
  const loadingProfile = useSession((s) => s.loadingProfile);

  // Home, keyed by the account it was loaded for.
  const [homeFor, setHomeFor] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !userId) return;
    let live = true;
    const settle = () => {
      if (live) setHomeFor(userId);
    };
    // Bounded: a hung request shows Home's skeleton rather than holding the logo.
    const timer = setTimeout(settle, HOME_WAIT_MS);
    void warmHome(userId).finally(settle);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready, userId]);

  // The profile step is finished when there is one, or when loading stopped
  // without one (the entry gate's repair path takes it from there).
  const profileSettled = hasProfile || !loadingProfile;
  const homeSettled = homeFor === userId;

  let step: 'start' | 'profile' | 'home' | 'done';
  if (!fontsReady || !ready) step = 'start';
  else if (!userId) step = 'done';
  else if (!profileSettled) step = 'profile';
  // No profile at all means the repair path, which is not Home — don't wait.
  else if (hasProfile && !homeSettled) step = 'home';
  else step = 'done';

  // "Slow connection" once the same step has dragged on.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (step === 'done') return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const PROGRESS = { start: 0.18, profile: 0.42, home: 0.72, done: 1 } as const;
  const STATUS = {
    start: 'Starting up…',
    profile: 'Signing you in…',
    home: 'Loading your home…',
    done: 'All set',
  } as const;

  return {
    progress: PROGRESS[step],
    status: slow ? 'Still working — your connection seems slow…' : STATUS[step],
    done: step === 'done',
  };
}
