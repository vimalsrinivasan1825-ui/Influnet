"use client";

/**
 * Live list refresh over Supabase Realtime.
 *
 * The dashboard's list pages (requests, projects) used to be static once
 * mounted: they loaded on mount and nothing ever told them a row had changed,
 * so a request accepted on the other side only appeared on a manual reload.
 * This hook is the missing half — it opens a postgres_changes subscription for
 * the current user's rows and calls the page's own refetch when one changes.
 *
 * Deliberately dumb about payloads: it never merges the replicated row into
 * local state. The list pages render server-shaped rows (joined profiles,
 * derived `deal_state`) that a raw table row cannot reconstruct, so the only
 * correct reaction to "something changed" is to re-run the page's existing
 * fetch. That also means this hook can never disagree with the API.
 *
 * Requires the tables to be in the `supabase_realtime` publication — see
 * supabase/migrations/090_realtime_collab_and_projects.sql. Without it the
 * subscription still opens and simply never fires, which is why every caller
 * must keep working when no event ever arrives.
 */

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationStore, type NotificationItem } from "@/store/notification-store";

export interface RealtimeWatch {
  /** Table in the `public` schema, e.g. "collab_requests". */
  table: string;
  /**
   * PostgREST-style filters, one listener each.
   *
   * postgres_changes accepts a single `filter` per listener, so "rows where I
   * am either side" has to be two listeners (`from_user_id=eq.X` and
   * `to_user_id=eq.X`), not one OR expression.
   */
  filters: string[];
}

interface Options {
  /**
   * Channel topic. Must be unique per page — two pages sharing a topic on the
   * same socket collide and one of them silently stops receiving. A per-mount
   * suffix is appended automatically, so passing a stable page-scoped name is
   * enough.
   */
  channelName: string;
  watches: RealtimeWatch[];
  /**
   * The page's refetch.
   *
   * `changed` names the tables that fired during the debounce window, so a page
   * watching several tables can refetch only the slices that table can actually
   * invalidate instead of everything. The project detail page loads eight
   * endpoints; re-running all eight on every checklist tick would be a
   * stampede on a page people sit on for the length of a campaign.
   *
   * It is EMPTY when the refetch was triggered by the notification backstop
   * below, which knows a notification type but not a table. Treat an empty set
   * as "something changed, I don't know what" and refresh the core slices.
   * Callers that watch a single table can ignore the argument entirely, which
   * is what the list pages do.
   */
  onChange: (changed: ReadonlySet<string>) => void | Promise<void>;
  /** Skip while the page has no user yet. */
  enabled?: boolean;
  /**
   * Coalescing window. One user action commonly writes several rows (accepting
   * a deal touches the request, then the project), and each is its own event —
   * without this the page would refetch three times in a row.
   */
  debounceMs?: number;
  /**
   * Return true to hold the refetch off for now; it is retried after another
   * debounce window instead of being dropped. Used by the requests page so a
   * refetch can't land in the middle of an optimistic action or an undo window.
   */
  shouldDefer?: () => boolean;
  /**
   * Second, cheaper signal for the same refetch: "a notification of one of
   * these types arrived for me".
   *
   * DashboardShell already holds a postgres_changes subscription on
   * `notifications` and pushes every row into the notification store, so
   * watching that store costs no extra channel. It is a backstop for the case
   * where THIS page's channel failed to subscribe (a per-channel error the
   * shell's channel survives) while the socket itself is fine.
   *
   * Deliberately narrow, mirroring the shell's own TOASTABLE gate: without a
   * type list every chat message ('message' rows are written per message) would
   * refetch the list for nothing.
   *
   * It is NOT a guard against a dropped socket. The browser client is a
   * singleton, so the shell's channel and this page's channel ride the same
   * WebSocket and go deaf together; postgres_changes replays nothing on
   * reconnect and the header fetches `/api/notifications` once, on mount. Nor
   * is it a DELETE workaround any more: migration 089 dropped
   * campaign_projects_delete_participant (cancellation is a status UPDATE) and
   * 071 dropped respond_to_project_proposal(), so the only DELETE left is the
   * admin-only policy from 038.
   */
  notifyTypes?: readonly string[];
}

/**
 * Notifications older than mount are backlog, not events — see the seeding
 * comment below. The slack absorbs client-vs-server clock skew; erring towards
 * an extra refetch is far cheaper than missing a real one.
 */
const NOTIFICATION_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Stable empty array so the store selector can't cause a re-render. */
const NO_NOTIFICATIONS: NotificationItem[] = [];

/** Per-mount suffix so a remount (or React StrictMode) never reuses a topic. */
let instanceSeq = 0;

/**
 * How many times a single pending refetch may be deferred before it goes ahead
 * anyway. `shouldDefer` is driven by page state (an action in flight, an undo
 * window); if that state ever gets stuck — a request that never settles, an
 * undo timer that outlives its card — an unbounded retry loop would re-arm
 * every `debounceMs` for the lifetime of the page and the list would never
 * update again. Refetching over a stuck action is the lesser evil: the page is
 * at least correct, and the "Updating…" affordance it might interrupt is
 * already wrong by then.
 *
 * 30 * 350ms ≈ 10s, comfortably longer than the 5s decline-undo window and than
 * any action that is genuinely still in flight.
 */
const MAX_DEFERRALS = 30;

export function useRealtimeRefresh({
  channelName,
  watches,
  onChange,
  enabled = true,
  debounceMs = 350,
  shouldDefer,
  notifyTypes,
}: Options): void {
  // Kept in refs so a changing inline callback never resubscribes the socket.
  // Written in an effect rather than during render — a render-phase ref write
  // is not safe under concurrent rendering and the lint rules reject it.
  const onChangeRef = useRef(onChange);
  const shouldDeferRef = useRef(shouldDefer);
  const notifyTypesRef = useRef(notifyTypes);
  useEffect(() => {
    onChangeRef.current = onChange;
    shouldDeferRef.current = shouldDefer;
    notifyTypesRef.current = notifyTypes;
  });

  // ONE scheduler for every signal that can ask for a refetch.
  //
  // It used to live inside the subscription effect, which meant the second
  // signal (notifications) had no way to reach it and called `onChange`
  // directly instead — so a single write that produces both a table event and a
  // notification row fired two refetches, and the notification one walked
  // straight past the `shouldDefer` gate that exists to stop a refetch
  // repainting the list mid-action. Hoisting it makes both paths share one
  // debounce window and one gate.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferralsRef = useRef(0);
  const mountedRef = useRef(true);
  /**
   * Tables that fired during the current window, accumulated rather than
   * overwritten: coalescing several events into one refetch must not lose the
   * fact that they came from different tables, or a page that refetches per
   * table would drop a slice. Cleared only once the refetch actually runs, so a
   * deferred window keeps everything it collected.
   */
  const changedRef = useRef<Set<string>>(new Set());
  /**
   * When this hook started caring, for the notification backstop below. Read in
   * the mount effect rather than during render — Date.now() is impure, and a
   * render-phase call is both unstable under re-render and a lint error.
   */
  const mountedAt = useRef(0);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current) return;
      // Not dropped — retried. A burst that arrives mid-action still has to
      // land eventually, otherwise the page ends up stale precisely when it
      // was busiest.
      if (shouldDeferRef.current?.() && deferralsRef.current < MAX_DEFERRALS) {
        deferralsRef.current += 1;
        schedule();
        return;
      }
      deferralsRef.current = 0;
      const changed = changedRef.current;
      changedRef.current = new Set();
      void onChangeRef.current(changed);
    }, debounceMs);
  }, [debounceMs]);

  /** Record the source table, then join the shared debounce window. */
  const scheduleFor = useCallback(
    (table: string) => {
      changedRef.current.add(table);
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    mountedRef.current = true;
    mountedAt.current = Date.now();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Serialised so an inline `watches` array literal doesn't retrigger the
  // effect on every render.
  const watchKey = JSON.stringify(watches);

  useEffect(() => {
    if (!enabled) return;
    const parsed = JSON.parse(watchKey) as RealtimeWatch[];
    if (parsed.length === 0) return;

    const sb = createClient();
    const channel = sb.channel(`${channelName}:${++instanceSeq}`);
    for (const w of parsed) {
      for (const filter of w.filters) {
        channel.on(
          "postgres_changes",
          // '*' because a new request is an INSERT and everything after it — an
          // accept, a decline, a stage advance, a cancellation — is an UPDATE.
          //
          // DELETE is included by '*' but will never actually be delivered to a
          // filtered listener: Supabase cannot filter DELETE events at all, and
          // under RLS the old record carries only the primary key, so no
          // `*_user_id=eq.<uid>` filter can match one. Nothing in the current
          // schema hard-deletes one of these rows outside the admin-only policy
          // from migration 038 — see `notifyTypes` above.
          // See supabase/migrations/090_realtime_collab_and_projects.sql.
          { event: "*", schema: "public", table: w.table, filter },
          () => scheduleFor(w.table),
        );
      }
    }
    channel.subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [channelName, watchKey, enabled, scheduleFor]);

  // The notification backstop, feeding the same scheduler.
  const watchNotifications = !!notifyTypes && notifyTypes.length > 0;
  const notifications = useNotificationStore((s) =>
    watchNotifications ? s.notifications : NO_NOTIFICATIONS,
  );

  // Ids already accounted for, so a store update that merely re-renders (a
  // mark-as-read, say) can't be mistaken for an arrival.
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const types = notifyTypesRef.current;
    if (!types || types.length === 0) return;
    // Set by the mount effect above, which is declared first and therefore
    // always runs first. Belt and braces.
    if (mountedAt.current === 0) return;

    // Walk the whole list, not just [0].
    //
    // Two reasons the newest-only check was wrong. First, it missed events: if
    // two rows land in one React batch, a 'project_stage' sitting behind a
    // 'message' is never examined. Second, it fired spurious ones: `seen` was
    // seeded from the store at mount, but the store is empty then — the header
    // populates it asynchronously afterwards — so the page seeded `undefined`,
    // the header installed a possibly days-old row at [0], and a matching type
    // refetched immediately for nothing, right after the page's own first
    // fetch. Hence the timestamp gate as well: a notification older than this
    // mount is backlog, and backlog is what the initial fetch already covers.
    let hit = false;
    for (const n of notifications) {
      if (handledIds.current.has(n.id)) continue;
      handledIds.current.add(n.id);
      if (!types.includes(n.type)) continue;
      const at = new Date(n.created_at).getTime();
      if (at < mountedAt.current - NOTIFICATION_CLOCK_SKEW_MS) continue;
      hit = true;
    }
    if (hit) schedule();
  }, [notifications, schedule]);
}
