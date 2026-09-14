# Incident log

One line per incident. Newest first. Thirty seconds to write, and after a year
it is the most valuable operational document in the repo — it is the only
thing that shows you a *pattern* rather than a series of unrelated bad
evenings.

Keep it boring. No blame, no prose. If a fix deserves explanation, link a
commit.

## Format

```
| Date | Symptom as first seen | Actual cause | Fix | Minutes |
```

"Symptom as first seen" matters as much as the cause. Next time, that is the
column you will be scanning — you will not know the cause yet.

---

| Date | Symptom | Cause | Fix | Min |
|---|---|---|---|---|
| 2026-08-12 | Every path on staging returned a bare 500 with only a `date` header | `NEXT_PUBLIC_SUPABASE_*` passed as build args only, so the runner stage booted without them and `instrumentation.ts` threw in `register()` | Set them as runtime env vars too; `deploy-dev.yml` now documents why both are required | ~240 |
| 2026-08-10 | Dev's OTP SMS silently became voice calls, still billed as SMS | Three commits (incl. an OTP template rename) landed only on `staging` and were never back-merged; dev's edge function kept the retired `Login_Verification_OTP` | Back-merged staging into dev; the branch rule is now in AGENTS.md | — |
| 2026-08-08 | Unpaid projects walked straight through the payment gate | The stage checklist was seeded lazily, so a project nobody had opened had no rows — `blockingItems([])` returned `[]` and every gate read as open | `stage-items-gate.ts` now distinguishes `null` (unreadable → degrade) from `[]` on a stage that should have items (broken → fail closed) | — |
| 2026-07-30 | — | A destructive operation was run against the wrong Supabase project | Standing rule: name the project out loud, and check it against `/dashboard/admin/health`, before any purge | — |

<!--
Add new rows at the TOP. Keep the historical ones — the oldest entries are the
ones that stop a mistake being made twice.
-->
