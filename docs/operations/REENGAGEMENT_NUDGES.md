# Re-engagement nudges

"You've been away" notifications — unread messages, a project waiting on you,
new campaigns since your last visit. In-app card **and** mobile push, never
email.

## What's built (code-complete, dormant until wired)

| Piece | Where |
|---|---|
| `profiles.last_active_at`, `profiles.nudges_opt_out` | migration 142 |
| `touch_last_active()` — bumped from `withAuth`, throttled 1/hr/user in-process + 30 min in SQL | migration 142 + `apps/web/src/lib/api.ts` |
| `nudge_candidates()` — who is dormant and why (`unread_messages` / `your_turn` / `new_campaigns` / `comeback`) | migration 142 |
| `POST /api/cron/nudges` — bearer-secret gated; maps each reason to copy, sends via `notifyUser` (`type: 'nudge'`), dedupes against nudges sent in the last 72 h | `apps/web/src/app/api/cron/nudges/route.ts` |
| Daily scheduler | `.github/workflows/reengagement-nudges.yml` (04:30 UTC / 10:00 IST) |
| Opt-out toggle | web settings + mobile settings → Notifications |

The route also respects the `notify_emails` feature flag (staging/prod run it
on) as a general "outbound messaging is live here" switch.

## To turn it on (founder steps)

1. **Apply migrations** through 142 on the target environment (`dev` first).
2. **Set `CRON_SECRET`** as a runtime env var on the deployed container. Add a
   line to the relevant deploy workflow's `--set-env-vars` (next to the
   Supabase vars), value from a new GitHub *secret* `CRON_SECRET`. Redeploy.
3. **Add two Actions secrets** so the scheduler can reach the endpoint:
   - `NUDGE_ENDPOINT` = `https://<deployment>/api/cron/nudges`
   - `CRON_SECRET` = the same value as step 2
4. The workflow is already committed and scheduled; with the secrets absent it
   is a no-op, so nothing fires early. Once the secrets exist the next run (or
   a manual **Run workflow**) starts the daily fan-out.

### Alternative: pg_cron instead of GitHub Actions

If you'd rather keep it inside Supabase, enable the `pg_cron` and `pg_net`
extensions and schedule:

```sql
select cron.schedule('reengagement-nudges', '30 4 * * *', $$
  select net.http_post(
    url     := 'https://<deployment>/api/cron/nudges',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
$$);
```

Then delete the GitHub workflow so it doesn't double-fire.

## Tuning

- Cadence: `nudge_candidates(p_soft_days, p_hard_days, p_limit)` — defaults
  3 / 7 / 500. The route calls it with no args.
- The 72 h no-repeat window and the 45-day "stop nagging" cutoff are in the
  function body.
- Copy lives in the `COPY` map in the route.
