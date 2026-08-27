# Release 1 — status check

Verified 27 August 2026 against `dev` at `361ed757`, including live queries to
the dev database. Short version of what is actually true.

---

## Headline

**The Lane 1 blockers are genuinely fixed. The rest of the release is a data
layer and half an API layer — it is not yet a product.**

Roughly: schema ~90% done, API ~40%, **UI ~5%, mobile 0%, tests 0%**.

Two of the twelve migrations did not apply, and one of those two cannot apply as
written.

| Layer | State |
|---|---|
| Migrations | **10 of 12 applied** — 127 and 130 are missing |
| API routes | Campaigns + documents exist; applications, hand-off, favourites do not |
| Web UI | No campaigns board, no admin page, no documents section, nothing for S1–S5 |
| Mobile | **Nothing** for B, C or S |
| Tests | 453 passing — **the same 453 as before**. No new test, no e2e phase |

---

## Done, and correct

Worth stating, because it is real work and it is right:

- **All three Lane 1 blockers are closed.** Verified live: `flow_key`,
  `is_barter`, `barter_details` on `campaign_projects`; both triggers present;
  `propose_project` now has its 12-arg signature; the renumber to 121 was done
  cleanly.
- **A1–A5 are genuinely complete.** Both apps typecheck clean, working tree is
  committed.
- **C4's RPC handles the hard constraint correctly** — it materialises a
  `collab_requests` row and calls `get_or_create_conversation()`, which was the
  one thing most likely to be got wrong.
- **C1's approval gate is right** — it reads `approval_status` from
  `business_profiles` rather than re-implementing the check, uses `{campaigns}` /
  `{campaign}` envelopes, and is rate-limited.
- **B2 added `@react-pdf/renderer`**, as recommended, not Puppeteer.
- Tables created and verified: `campaigns`, `campaign_applications`,
  `project_documents`, `saved_items`, plus `profiles.creating_since` and the four
  review score columns.

---

## Two things are broken, not just missing

### 127 — campaign limits: wrong schema, migration failed

```sql
INSERT INTO public.billing_settings (key, value, updated_at) VALUES ('free_live_campaigns', '3', now()) ...
```

`billing_settings` is **not** a key/value table. It is a single-row table
(`id BOOLEAN PRIMARY KEY`) with one column per setting — `free_active_projects`,
`free_requests_per_month`, `free_shortlist_size`, and so on. There is no `key`
column, so this migration errored and is absent from the applied list.

**Fix:** rewrite as `ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS
free_live_campaigns INTEGER NOT NULL DEFAULT 3`, and the same for
`free_applications_per_week` and `campaign_default_days`.

### 130 — networking funnel: cannot apply as written

It uses `CREATE OR REPLACE FUNCTION` while adding `requests_sent` to the
`RETURNS TABLE`. **Postgres cannot change a function's return type with CREATE OR
REPLACE.** Live `get_collaboration_stats` still returns the old 8 columns.

**Fix:** `DROP FUNCTION public.get_collaboration_stats(UUID);` first, then create,
then re-`GRANT EXECUTE ... TO anon, authenticated` — the grant is lost with the
drop.

---

## Marked ✅, but not actually built

| Task | What exists | What is missing |
|---|---|---|
| **C2** Campaigns board | API route | **No page.** No `dashboard/campaigns`. A creator cannot see a campaign |
| **C3** Applications | Table (126) | **No API at all.** No `api/campaigns/[id]/applications`. A creator cannot apply |
| **C4** Hand-off | RPC (129) | **Nothing calls it.** `accept_campaign_application` is not referenced anywhere in `apps/`. A brand cannot accept an application |
| **C5** Spam controls | `api/admin/campaigns` | **No admin page.** Also no live-campaign cap, no brief minimum, no report-a-campaign |
| **C6** Campaign limits | Two `GATED_FEATURES` keys | Migration failed, no columns, **and nothing reads the limits.** The plan says not to add a feature key unless the server enforces it — right now they are decorative |
| **B3** Documents in-product | API route | **No UI**, and no receipt offered at completion — which was the whole reason B moved up from R2 |
| **S1** Creator level | `packages/core/src/creator-level.ts`, exported | **No consumer.** Nothing renders a tier |
| **S2** Creating since | Column (122) | No signup question, no profile line, no code reference at all |
| **S3** Favourites | Table (123) | **No code references `saved_items`.** Nothing can save anything |
| **S4** Networking funnel | Migration 130 (unapplied, broken) | No screen |
| **S5** Reviews & reputation | Four columns (128) | The reviews route does not read or write them. No completion prompt, no brand ratings |

The pattern is consistent: **the migration landed, the product did not.** For most
of these the schema is the easy 20%.

---

## Also outstanding

- **Mobile has zero work** on B, C or S. Plan invariant 9 says mobile ships in
  the same task as web; that has stopped happening.
- **No tests were added.** 38 files and 453 tests, identical to the previous
  review. `tests/e2e/phase8-short-projects.mjs` — the top recommendation of the
  last report — still does not exist, so **short-term projects have never been
  proven to work end to end**, only to typecheck.
- **B4** is correctly parked on Q1. That one is right.

---

## Do this next

1. **Fix and apply 127 and 130.** Both are small rewrites. Verify the columns and
   the 9-column function signature afterwards.
2. **Write `tests/e2e/phase8-short-projects.mjs`.** It has now been deferred
   twice, and A1–A5 are still unproven end to end.
3. **Finish the campaign loop: C3 route → C4 route → C2 page.** Right now the
   chain breaks at "creator applies", so nothing downstream can be exercised.
   A brand can publish into a void.
4. **Give B3, S1, S2, S3, S5 their UI.** Each is small; none is started.
5. **Then mobile**, for whatever of the above is settled.

Nothing here needs re-architecting. The schema decisions and the RPC design are
sound — what is missing is the half of each task that faces a user, plus the
tests that would have caught 127 and 130 before they were reported as applied.
