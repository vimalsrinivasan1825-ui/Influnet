/**
 * Live updates over Supabase Realtime.
 *
 * Before this, mobile had no realtime at all outside chat: badges came from a
 * 60s poll (notification-summary.ts) and lists only refetched when you
 * navigated back to them. So "the brand accepted your request" could sit
 * invisible for a minute, and a screen you were already looking at never
 * changed at all.
 *
 * Shape of the fix, deliberately small:
 *   - one set of channels for the whole app, opened once per session
 *   - notifications  -> refresh the shared summary immediately (badges)
 *   - collab_requests / campaign_projects -> bump a counter that the requests
 *     and projects screens watch and re-run their own fetch on
 *   - profiles / user_blocks -> bump a counter so the profile and settings
 *     screens re-read their state when something changes on the other side
 *
 * It bumps a counter rather than merging the replicated row, because the
 * screens render API-shaped rows (joined profile names, derived `deal_state`)
 * that a raw table row cannot reconstruct. The only correct reaction to
 * "something changed" is the screen's existing fetch.
 *
 * The 60s poll stays. Realtime on a phone is not a guarantee — the socket dies
 * in tunnels, on network handover, and while backgrounded — so the poll remains
 * the floor and this is the fast path on top of it.
 *
 * Requires supabase/migrations/090_realtime_collab_and_projects.sql to be
 * applied for the collab_requests / campaign_projects halves. Until then those
 * channels subscribe successfully and simply never fire, and the app behaves
 * exactly as it did before.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useNotificationSummary } from './notification-summary';
import { logger } from './logger';

/** Screens subscribe to these counters; each bump means "refetch yourself". */
interface RealtimeState {
  requestsTick: number;
  projectsTick: number;
  /**
   * Per-project counter, keyed by project id, for the project detail and stage
   * screens. Separate from `projectsTick` on purpose: the list wants to know
   * that *some* project moved, an open project wants to know that *this* one
   * did, and conflating them would refetch a three-endpoint stage screen every
   * time any unrelated project of yours changed.
   */
  projectTicks: Record<string, number>;
  /**
   * Bumped whenever the session's channel set is opened or torn down.
   *
   * Per-project channels are opened by screens, which can mount before
   * startRealtime() has run (a cold start deep-linked into a project) — without
   * a signal to re-run on, such a screen would stay channel-less for its whole
   * life. It doubles as the resume re-arm: the same teardown/reopen that fixes
   * the session channels re-opens the screens' channels through this.
   */
  gen: number;
}

export const useRealtimeTicks = create<RealtimeState>(() => ({
  requestsTick: 0,
  projectsTick: 0,
  projectTicks: {},
  gen: 0,
}));

let channels: RealtimeChannel[] = [];
let currentUserId: string | null = null;
let appStateSub: { remove: () => void } | null = null;

/**
 * Channels for the projects a screen currently has open, refcounted by project
 * id: the detail screen and the stage screen it pushes are both mounted at
 * once, and they want the same rows.
 *
 * Module-level rather than per-screen state for one reason — stopRealtime()
 * has to be able to close them. A channel that outlives its session reconnects
 * with a dead token, which is the bug the sign-out cycle was spent fixing, and
 * an unmount-only teardown cannot cover signing out while a project is on
 * screen.
 */
const projectSubs = new Map<string, { count: number; channel: RealtimeChannel | null }>();

/**
 * Bumped by every startRealtime() and stopRealtime().
 *
 * The resume handler tears the channels down and reopens them in a `.then`, and
 * that gap is long enough for a startRealtime() to land in the middle of it.
 * Checking the user id alone does not catch this: a sign-out-and-back-in as the
 * same user, or simply a start during the teardown, leaves the id unchanged, so
 * both paths call openChannels() and the first set is orphaned — no longer in
 * `channels`, therefore never closed by stopRealtime(), and still subscribed
 * with a token that is about to die. The generation makes "is this continuation
 * still the current one?" answerable rather than guessed.
 */
let generation = 0;

/**
 * Coalesce bursts. One user action on the other side commonly writes several
 * rows (answer the request, then create the project), and each is its own
 * event — without this every screen refetches once per event.
 */
const DEBOUNCE_MS = 400;
const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

function debounce(key: string, fn: () => void): void {
  if (timers[key]) clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    timers[key] = undefined;
    fn();
  }, DEBOUNCE_MS);
}

function clearTimers(): void {
  for (const key of Object.keys(timers)) {
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = undefined;
  }
}

const bumpRequests = () =>
  debounce('requests', () =>
    useRealtimeTicks.setState((s) => ({ requestsTick: s.requestsTick + 1 })),
  );

const bumpProjects = () =>
  debounce('projects', () =>
    useRealtimeTicks.setState((s) => ({ projectsTick: s.projectsTick + 1 })),
  );

const refreshSummary = () =>
  debounce('summary', () => void useNotificationSummary.getState().refresh());

/** One open project changed. Debounced per id so two projects can't share a window. */
const bumpProject = (projectId: string) =>
  debounce(`project:${projectId}`, () =>
    useRealtimeTicks.setState((s) => ({
      projectTicks: { ...s.projectTicks, [projectId]: (s.projectTicks[projectId] ?? 0) + 1 },
    })),
  );

/**
 * Bump every project a screen currently has open.
 *
 * For signals that say "something happened" without naming a project — the
 * notifications channel, an app resume. Bounded by what is actually on screen,
 * which is one or two ids, so it is far cheaper than it sounds.
 */
const bumpOpenProjects = () => {
  for (const id of projectSubs.keys()) bumpProject(id);
};

function openChannels(userId: string): void {
  // A notification row is written for every event worth a badge (see
  // apps/web/src/lib/notify.ts), so this one channel keeps every count live.
  const notifications = supabase
    .channel(`mobile-notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const type = (payload.new as { type?: string } | null)?.type;

        // The summary moves for everything, including chat: the unread badge is
        // exactly what a 'message' row is for.
        refreshSummary();

        // The list bumps are not for everything. A 'message' row is written per
        // chat message (apps/web/src/app/api/stream/webhook/route.ts), so an
        // active conversation used to drive two full list refetches per message
        // — neither of which could ever show a different result, since a chat
        // message changes no request and no project. Same intent as the web
        // shell's TOASTABLE gate: chat is Stream's business, not this channel's.
        if (type === 'message') return;

        // Anything else: a notification usually accompanies a row change on one
        // of the two tables below, but not always from a path we replicate (a
        // DELETE can never reach a filtered listener at all), so bumping both is
        // the cheap way to keep the screens honest.
        bumpRequests();
        bumpProjects();
        bumpOpenProjects();
      },
    )
    .subscribe();

  // Two listeners per table, not one: postgres_changes takes a single `filter`
  // per listener, so "rows where I am either side" cannot be expressed as one
  // OR condition.
  const requests = supabase
    .channel(`mobile-collab-requests:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'collab_requests', filter: `from_user_id=eq.${userId}` },
      bumpRequests,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'collab_requests', filter: `to_user_id=eq.${userId}` },
      bumpRequests,
    )
    .subscribe();

  // The project row itself is already covered here, for both the list and any
  // open project screen: the changed row's id is in `payload.new`, so a stage
  // advanced, skipped or signed off on the other side reaches an open project
  // without a second channel — and without waiting on migration 091, since
  // campaign_projects has been published since 090. The per-project channels
  // below only exist for the child tables 091 adds.
  const onProjectRow = (payload: { new?: unknown }) => {
    bumpProjects();
    const id = (payload.new as { id?: string | number } | null | undefined)?.id;
    if (id != null && projectSubs.has(String(id))) bumpProject(String(id));
  };

  const projects = supabase
    .channel(`mobile-campaign-projects:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'campaign_projects', filter: `owner_user_id=eq.${userId}` },
      onProjectRow,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'campaign_projects',
        filter: `counterparty_user_id=eq.${userId}`,
      },
      onProjectRow,
    )
    .subscribe();

  // ── Profile changes ────────────────────────────────────────────
  // A profile update (name, avatar, bio — or the more critical verified_badge
  // and expo_push_token) should trickle to the profile screen without a pull.
  // One channel, self-only.
  const profiles = supabase
    .channel(`mobile-profiles:${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      () => {
        // A profile change might affect what the public endpoints return, but
        // the only screen that renders profile data directly is Profile — and
        // it fetches /api/home, not the raw table. Bump projects so any screen
        // that embeds the user's name/avatar refetches.
        bumpProjects();
        bumpRequests();
      },
    )
    .subscribe();

  // ── User blocks ─────────────────────────────────────────────────
  // When the user blocks or unblocks someone, the list of blocked accounts
  // must update immediately. The settings screen fetches /api/blocks on mount;
  // bumping a generic timer still ensures the next visit shows fresh data.
  // Also used to refresh the requests screen, since a block affects contact.
  const blocks = supabase
    .channel(`mobile-user-blocks:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_blocks', filter: `blocker_id=eq.${userId}` },
      () => {
        bumpRequests();
      },
    )
    .subscribe();

  channels = [notifications, requests, projects, profiles, blocks];
}

async function closeChannels(): Promise<void> {
  const open = channels;
  channels = [];
  await Promise.all(open.map((c) => supabase.removeChannel(c).catch(() => undefined)));
}

/**
 * The child tables behind a project's stage UI: the checklist, the stage update
 * thread and the change-request queue. All three key off `project_id` (bigint,
 * see migrations 054 / 063 / 064), so one filter per table covers both
 * participants — unlike the session channels, where "rows where I am either
 * side" needs two.
 *
 * Requires supabase/migrations/091_realtime_project_children.sql. Until it is
 * applied this channel subscribes and never fires, and the screens keep the
 * refetch-on-your-own-action behaviour they already had.
 */
function openProjectChannel(projectId: string): RealtimeChannel {
  const bump = () => bumpProject(projectId);
  return supabase
    .channel(`mobile-project:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'project_stage_items', filter: `project_id=eq.${projectId}` },
      bump,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'project_stage_entries', filter: `project_id=eq.${projectId}` },
      bump,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'project_change_requests', filter: `project_id=eq.${projectId}` },
      bump,
    )
    .subscribe();
}

/** Close the per-project channels without forgetting who is still watching. */
async function closeProjectChannels(): Promise<void> {
  const open: RealtimeChannel[] = [];
  for (const sub of projectSubs.values()) {
    if (sub.channel) open.push(sub.channel);
    // The refcount survives: the screens holding it are still mounted, and a
    // resume (or a later sign-in) re-opens through the `gen` bump.
    sub.channel = null;
  }
  await Promise.all(open.map((c) => supabase.removeChannel(c).catch(() => undefined)));
}

/**
 * Re-arm after the app was backgrounded.
 *
 * iOS and Android both suspend the socket when the app leaves the foreground,
 * and it does not always come back on its own — a channel can sit in 'closed'
 * or 'errored' forever while the UI looks fine. Rather than trying to diagnose
 * which of the three died, the whole set is torn down and reopened; three
 * channel joins is cheap and it has one outcome instead of several.
 *
 * The refetch on resume is the other half and matters just as much: whatever
 * changed while the app was asleep produced no event anyone was listening for,
 * so the screens are stale by definition at the moment the user looks at them
 * again.
 */
function handleAppState(status: AppStateStatus): void {
  if (status !== 'active') return;
  const userId = currentUserId;
  if (!userId) return;

  const openProjectChannels = [...projectSubs.values()]
    .map((s) => s.channel)
    .filter((c): c is RealtimeChannel => !!c);
  const healthy =
    channels.length > 0 &&
    [...channels, ...openProjectChannels].every(
      (c) => c.state === 'joined' || c.state === 'joining',
    );

  if (!healthy) {
    logger.info('realtime resubscribing after resume');
    const gen = generation;
    // The per-project channels die in exactly the same way as the session ones,
    // so they are torn down with them and re-opened by the screens through the
    // `gen` bump below.
    void Promise.all([closeChannels(), closeProjectChannels()]).then(() => {
      // Guard against a sign-out OR a startRealtime() that landed while the
      // teardown was in flight. The id check alone lets a same-user restart
      // through, and then both it and this continuation open a channel set.
      if (generation !== gen || currentUserId !== userId) return;
      openChannels(userId);
      useRealtimeTicks.setState((s) => ({ gen: s.gen + 1 }));
    });
  }

  refreshSummary();
  bumpRequests();
  bumpProjects();
  // Whatever moved while the app was asleep produced no event anyone heard, so
  // an open project is stale by definition at the moment it is looked at again.
  bumpOpenProjects();
}

/**
 * Open the channels for a signed-in user. Idempotent, and a no-op when already
 * running for the same user; called from the tabs layout alongside the summary
 * poll so both share one lifecycle.
 */
export function startRealtime(userId: string): void {
  if (currentUserId === userId && channels.length > 0) return;
  if (currentUserId && currentUserId !== userId) stopRealtime();

  generation += 1;
  currentUserId = userId;
  openChannels(userId);
  // Lets any project screen that mounted before this ran (a cold start
  // deep-linked into a project) open its channel now.
  useRealtimeTicks.setState((s) => ({ gen: s.gen + 1 }));

  // One listener, ever. handleAppState reads module state rather than anything
  // captured, so a second registration would not do anything useful — it would
  // just double every resume and, because the variable is overwritten, orphan
  // the first subscription so stopRealtime() could never remove it.
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', handleAppState);
  }
}

/**
 * Tear everything down.
 *
 * MUST be called from signOut() in lib/session.ts, in the same "stop background
 * work first, while the token is still valid" block as stopNotificationSummary().
 * A channel left open past sign-out reconnects with a dead token, and that class
 * of stray authenticated work is exactly the bug that produced the sign-in
 * screen loop.
 */
export function stopRealtime(): void {
  generation += 1;
  currentUserId = null;
  clearTimers();
  appStateSub?.remove();
  appStateSub = null;
  void closeChannels();
  // A project screen can still be mounted at sign-out (signing out from a deep
  // link, a session that expired under you), and its channel would otherwise
  // live until that screen unmounts — authenticated work outliving its token,
  // which is the class of bug the sign-out cycle was spent removing. The
  // refcounts stay so the screens can re-open cleanly if a session returns.
  void closeProjectChannels();

  // No `gen` bump here on purpose. Bumping it would wake every mounted project
  // screen's effect during teardown, and `currentUserId` is already null by
  // then so they would find nothing to do — but a bump is a change, and the one
  // thing sign-out must not do is nudge screens from the outgoing session into
  // acting. Re-arming is startRealtime()'s job.

  // The ticks are deliberately NOT reset here.
  //
  // Resetting them to 0 made sign-out itself look like an event: a screen still
  // mounted from the outgoing session had `seen = 3`, and 0 !== 3 reads as a
  // change, so useLiveRefresh fired a revalidate() — with a token that was
  // still valid, because stopRealtime() runs early in signOut() by design. That
  // response could then land after clearFetchCache() and repopulate the cache,
  // painting the previous account's requests to the next one.
  //
  // Leaving them monotonic removes the trigger at source rather than filtering
  // it downstream: no reset, no phantom change, no revalidate during teardown.
  // Carrying a stale count into the next session costs nothing — `seen` is
  // per-mount, so the next session's screens start from whatever the counter
  // happens to be and only react to genuine increments after that.
}

/**
 * Re-run a screen's fetch whenever its rows change (or the app resumes).
 *
 * Pass `revalidate` from useFetch, not `refresh`: this is a background update
 * the user didn't ask for, so it must not raise the pull-to-refresh spinner.
 * The first render is skipped — the screen has just fetched.
 */
/**
 * Keep one project live while a screen is looking at it.
 *
 * Same contract as useLiveRefresh: pass `revalidate` from useFetch, never
 * `refresh` — this is an update the user did not ask for, so it must not raise
 * the pull-to-refresh spinner. Both the detail screen and the stage screen it
 * pushes call this with the same id; the channel is refcounted, so they share
 * one and the last one out closes it.
 *
 * A screen's own action does not need this — those already refetch on success —
 * but an event for it will arrive anyway, and re-running a fetch that returns
 * what is already on screen changes nothing the user can see. That is why there
 * is no busy gate here: unlike the web page, nothing on these screens is
 * rendered optimistically ahead of the server (toggleItem and act() both wait
 * for the response before refetching), so there is no local state a revalidate
 * could stomp.
 */
export function useProjectLive(projectId: string | undefined, revalidate: () => void): void {
  const gen = useRealtimeTicks((s) => s.gen);

  useEffect(() => {
    if (!projectId) return;

    const existing = projectSubs.get(projectId);
    const sub = existing ?? { count: 0, channel: null };
    sub.count += 1;
    projectSubs.set(projectId, sub);

    // No session yet (a cold start that beat startRealtime, or signed out):
    // hold the refcount and open when the `gen` bump says a session exists.
    if (!sub.channel && currentUserId) sub.channel = openProjectChannel(projectId);

    return () => {
      const cur = projectSubs.get(projectId);
      if (!cur) return;
      cur.count -= 1;
      if (cur.count > 0) return;
      projectSubs.delete(projectId);
      if (cur.channel) void supabase.removeChannel(cur.channel).catch(() => undefined);
    };
  }, [projectId, gen]);

  const tick = useRealtimeTicks((s) => (projectId ? (s.projectTicks[projectId] ?? 0) : 0));

  const fnRef = useRef(revalidate);
  useEffect(() => {
    fnRef.current = revalidate;
  });

  const seen = useRef(tick);
  useEffect(() => {
    // `<=` for the same reason as useLiveRefresh: a decrease means the world
    // restarted, not that these rows changed.
    if (tick <= seen.current) {
      seen.current = tick;
      return;
    }
    seen.current = tick;
    fnRef.current();
  }, [tick]);
}

export function useLiveRefresh(kind: 'requests' | 'projects', revalidate: () => void): void {
  const tick = useRealtimeTicks((s) => (kind === 'requests' ? s.requestsTick : s.projectsTick));

  // Screens define the callback inline; a ref keeps it out of the dependency
  // list so a re-render can't be mistaken for an event. Written in an effect
  // rather than during render — a render-phase ref write is not safe under
  // concurrent rendering, and the web sibling
  // (apps/web/src/hooks/use-realtime-refresh.ts) does it this way for the same
  // reason. The two are meant to read as one design.
  const fnRef = useRef(revalidate);
  useEffect(() => {
    fnRef.current = revalidate;
  });

  const seen = useRef(tick);
  useEffect(() => {
    // `<=`, not `!==`. stopRealtime() no longer resets the counters, so this
    // should never see a decrease — but if anything ever does reset them, a
    // decrease means "the world restarted", not "your rows changed", and
    // revalidating on it is exactly the sign-out race described in
    // stopRealtime(). Resync silently instead.
    if (tick <= seen.current) {
      seen.current = tick;
      return;
    }
    seen.current = tick;
    fnRef.current();
  }, [tick]);
}
