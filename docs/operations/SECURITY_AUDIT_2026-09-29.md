# Security audit remediation — 2026-09-29

Source-only audit (Cloudflare security-audit skill). Full report: `~/security-audit-skill/Influnet/run-2/`.
Root cause: rules enforced in API routes but not by RLS, RPC grants or triggers, while PostgREST is reachable
directly with the anon key. `staging` is production, so every fix below is live on push.

## Fixed (migrations 177-189 plus code)

| Finding | Fix |
|---|---|
| Self-insert of `role='admin'` profile | 177: revoke INSERT on profile tables, BEFORE INSERT guard |
| Anonymous phone-OTP minting; providerSessionId path injection; edge `userId` write | 178, edge function validation |
| Phone verify/reset on any user id | 179 |
| Change-request `proposed_by` rewrite | 180 |
| Forged `paid` payment rows | 181 |
| Business self-approval | 182 |
| Forged completed projects / retargeted reviews | 183 |
| Collab request / application column rewrites | 184 |
| Self-awarded verified badge / forged IG ownership | 185 + service-client calls |
| Quota reset via `release_quota` | 186 + service-client calls |
| Contact reveal and eligibility bypass | 187, 188 |
| Blocks not enforced for conversations | 189 |
| Rate-limit key spoof (x-vercel-forwarded-for) | `rate-limit.ts` |
| Open redirect after login | `safeNextPath` |
| CSV formula injection, `?mock=1`, `javascript:` stage URLs | code fixes |
| Unused public `auth-signup` function | removed (still delete the deployed copy) |
| Baseline security headers, seed password, tracked PII backup | code / repo |

## Do after deploy

1. `supabase functions delete auth-signup --project-ref <ref>`.
2. Check for admin profiles created outside `provision_admin`: `select id,email,created_at from profiles where role='admin' order by created_at;`
3. Purge `test-data-backup-*.json`, `madan-gowri-backup*`, `phase0-cleanup-backup*` from git history if the repo is shared; confirm `qacreator` password was changed.
4. Migrations were syntax-checked only, not run against a database. Apply to a scratch Supabase project first.

## Not fixed (needs a design decision or a coordinated client release)

- Stage machine and checklist gates are enforced only in the API (`ALLOWED_TRANSITIONS` lives in packages/core; a SQL mirror needs a product decision).
- Admin section scoping is API-only; `admin_*` RPCs reachable by any staff JWT (migration 176 known limit).
- Cloudinary signing has no `allowed_formats` / size cap: adding signed params breaks already-installed mobile builds, needs an OTA first.
- No CSP (needs an origin inventory), audit-log fail-open, Stream token expiry and webhook sender check, OTP token single-use and phone uniqueness, analytics INSERT forgery, admin-removed campaign reinstatement.
