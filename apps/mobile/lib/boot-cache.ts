/**
 * Last-launch snapshots, so a cold start can paint before the network answers.
 *
 * A signed-in cold start used to wait on three round trips in a row before
 * anything useful was on screen: the token refresh, /api/profile (the splash
 * held for it), then /api/home → dashboard + campaigns (behind a skeleton).
 * On a cold API or a slow radio that was 5s+ of splash followed by seconds of
 * skeleton, every single launch.
 *
 * Now the profile and the Home payload from the last successful load are kept
 * on disk per account. On launch they are read back (a few ms) and the app
 * opens on them while the fresh copies load behind — the same
 * stale-while-revalidate use-fetch already does in memory, extended across
 * launches. A first launch, or one after sign-out, still waits for the network.
 *
 * What this is NOT: a source of truth. Every snapshot is replaced by the live
 * response moments later, and nothing decides permissions or money off one —
 * the server re-checks every write. Snapshots are scoped to the user id, never
 * shared between accounts, dropped on sign-out, and ignored once older than
 * MAX_AGE so a phone left in a drawer for a month does not open on a month-old
 * screen.
 *
 * Plain AsyncStorage, same as lib/accounts.ts and for the same reasons: the
 * values are larger than SecureStore's 2 KB comfort zone and hold nothing
 * that is a credential.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const PREFIX = 'influnet.snapshot.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (userId: string, name: string) => `${PREFIX}.${userId}.${name}`;

/** The account the in-memory screen cache currently belongs to. Set by the session store. */
let activeUserId: string | null = null;

export function setSnapshotUser(userId: string | null) {
  activeUserId = userId;
}

export function snapshotUser() {
  return activeUserId;
}

/** Bounded read — a wedged storage layer must never hold the splash. */
function bounded<T>(p: Promise<T>, fallback: T, ms = 1500): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function readSnapshot<T>(userId: string, name: string): Promise<T | null> {
  const raw = await bounded(AsyncStorage.getItem(keyFor(userId, name)), null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed || typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeSnapshot(userId: string, name: string, data: unknown) {
  let raw: string;
  try {
    raw = JSON.stringify({ at: Date.now(), data });
  } catch {
    return;
  }
  AsyncStorage.setItem(keyFor(userId, name), raw).catch((err) => {
    logger.warn('[boot-cache] snapshot write failed', { err, name });
  });
}

/** Drop every snapshot for one account — sign-out removes it from the device. */
export async function clearSnapshots(userId: string) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`${PREFIX}.${userId}.`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch (err) {
    logger.warn('[boot-cache] clear failed', { err });
  }
}
