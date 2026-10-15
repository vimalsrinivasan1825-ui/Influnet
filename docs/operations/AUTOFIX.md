# Nightly autofix

Every night at 00:30 IST, `.github/workflows/autofix-nightly.yml` collects the last 24
hours of problems from the live site (staging), has Claude triage them, and reports.
It is the pilot of a loop meant for every project; the cross-project design is in the
Hermes repo at `docs/ops-hub/08-autofix-loop.md`.

| Piece | File |
|---|---|
| Workflow | `.github/workflows/autofix-nightly.yml` |
| Claude's instructions and off-limits list | `.github/autofix/PROMPT.md` |
| Collector (Sentry, `product_feedback`, `support_tickets`) | `scripts/autofix/collect.mjs` |
| Summary + Telegram line | `scripts/autofix/report.mjs` |

## What it reads
- **Sentry:** unresolved issues seen in the last 24 h in environment `staging`, with
  the latest event's exception and in-app stack frames. No user, headers, cookies or
  request bodies.
- **`product_feedback`:** `kind` bug or confusion, `status` new. No `user_id`.
- **`support_tickets`:** `category` bug, open or pending, plus the user's first message.

Emails, phone numbers and token-like strings are redacted before Claude sees anything.

## Modes
Set the repo variable `AUTOFIX_MODE`:
- `report` (default): read-only. The run's summary page lists every item with a
  decision (fix / escalate / ignore), the cause and the plan. Nothing is pushed.
- `pr`: up to `AUTOFIX_MAX_PRS` (default 2) PRs against `dev` labelled `autofix`, each
  with a failing-then-passing unit test; everything that needs you becomes an issue
  labelled `needs-human`. It never merges, deploys, or pushes to `dev` or `staging`.

Run it once by hand: Actions → Nightly autofix → Run workflow.

## Setup (owner)

Settings → Secrets and variables → Actions. These are **repository** secrets and
variables, not environment ones: the scheduled run starts on `dev` and can't read the
branch-restricted `staging` environment.

| Name | Kind | Value |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | secret | from `claude setup-token` (subscription) — or set `ANTHROPIC_API_KEY` instead |
| `AUTOFIX_SENTRY_TOKEN` | secret | Sentry → Settings → Auth Tokens, scopes `project:read`, `event:read` only |
| `AUTOFIX_SENTRY_ORG` | variable | Sentry org slug (same as `SENTRY_ORG`) |
| `AUTOFIX_SENTRY_PROJECT` | variable | Sentry project slug (same as `SENTRY_PROJECT`) |
| `AUTOFIX_SENTRY_URL` | variable | only if the org is in the EU: `https://de.sentry.io` |
| `AUTOFIX_SUPABASE_URL` | variable | **staging** Supabase URL |
| `AUTOFIX_SUPABASE_KEY` | secret | staging service-role key — used only by the collect step |
| `AUTOFIX_TELEGRAM_BOT_TOKEN` | secret | optional, for the morning line |
| `AUTOFIX_TELEGRAM_CHAT_ID` | variable | optional, your Telegram chat id |
| `AUTOFIX_MODE` | variable | `report` for the first week |

For `pr` mode, also install the Claude GitHub App on this repo
(https://github.com/apps/claude), so the PRs it opens run `ci.yml`.

Any source whose settings are missing is skipped with a note in the summary, so the
workflow can be turned on before everything is wired.

## Reading a night's run
Actions → Nightly autofix → the run → **Summary**. The inbox and Claude's report are
attached as artifacts (`autofix-inbox`, `autofix-report`) for 14 and 30 days.
An item that already has an open `autofix` PR or `needs-human` issue (matched by the
`autofix-key:` line in its body) is skipped the next night.
