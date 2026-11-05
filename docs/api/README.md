# Influnet API reference

| File | What it is |
|---|---|
| [`index.html`](index.html) | Swagger UI with the spec embedded. Open it straight from the repo; it needs internet only for the Swagger UI assets (cdnjs, pinned 5.17.14). |
| [`openapi.json`](openapi.json) | OpenAPI 3.1. Import into Postman, Insomnia, Bruno or <https://editor.swagger.io>. |
| [`openapi.overrides.json`](openapi.overrides.json) | The hand-written part: summaries, request bodies and response envelopes for the routes clients call most. |

**Every route is listed: 125 paths, 195 operations**, including admin, cron,
webhook and CORS-open routes. Each operation states:

- **Access**: public, signed-in, a specific role, an admin console section
  (`view` for GET, `manage` otherwise), super admin, cron secret, or webhook
  signature. This is read from the auth helper the route actually calls, so it
  can't drift from the code.
- **Rate limits**: every `enforceRateLimit` bucket, limit and window.
- **CORS**: whether the route answers any origin.
- **Source**: the route file.

The `x-access`, `x-role`, `x-admin-section` and `x-rate-limits` extensions
carry the same facts in machine-readable form.

## Keeping it current

```bash
node scripts/generate-openapi.mjs
```

Run it after adding, removing or re-securing a route, and commit both
generated files. `apps/web/tests/unit/openapi-coverage.test.ts` fails if you
forget, and also fails if an `/api/admin/*` route is ever classified as anything
other than admin.

To document a request body or response shape, add an entry keyed
`"METHOD /api/path/{param}"` to `openapi.overrides.json` and regenerate. The
generator refuses overrides for operations that no longer exist.

## What is not in it

- **Supabase PostgREST / RPC.** Web and mobile also talk to Supabase directly
  with the public anon key. Those calls are governed by RLS and function grants
  in `supabase/migrations`, not by these routes. Anything callable there is
  callable by anyone holding the anon key, which ships inside every client.
- **The `phone-otp` edge function** (`supabase/functions/phone-otp`). Reached
  only through `/api/phone-otp/*`.

## Should this be served from the app?

Not at a public URL. It's an accurate map of every admin and cron endpoint,
which is useful to an attacker even though every route enforces its own
access. If you want it in the product, serve `index.html` from an admin-only
page behind `withAdmin`.
