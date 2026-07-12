# Influnet

Influencer-marketing platform connecting businesses and creators — discovery, collaboration
requests, a 12-stage campaign pipeline with Kanban workspace, chat, and an admin approval flow.

## Repository Layout (Turborepo monorepo)

```
├── apps/
│   └── web/          # Next.js 16 app — frontend + API routes (the entire product)
├── packages/         # (reserved) future shared packages
├── supabase/         # Database migrations, edge functions (phone-otp, auth-signup), config
├── docs/             # Architecture, analysis, and setup documentation
├── .agents/          # AI-agent workflow rules, execution plan, lessons-learned log
├── .github/          # CI/CD pipeline (typecheck, lint, tests, build)
├── turbo.json        # Turborepo task pipeline
└── package.json      # npm workspaces root
```

> **Legacy code** (the old Firebase-hosted static site, bundle-patch scripts, and widgets)
> was removed in the monorepo refactor. It is preserved in git history at the tag
> **`legacy-archive`** — `git checkout legacy-archive` to inspect it.

## Getting Started

Prerequisites: **Node.js ≥ 20**, npm ≥ 10.

```bash
npm install                # installs all workspaces from the repo root

# environment — copy the example and fill in real values (never commit .env files)
cp apps/web/.env.example apps/web/.env.local

npm run dev                # turbo → next dev (http://localhost:3000)
```

### Common commands (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app dev server |
| `npm run build` | Production build (turbo-cached) |
| `npm run typecheck` | TypeScript check across workspaces |
| `npm run lint` | ESLint across workspaces |
| `npm run test` | All Vitest suites |
| `npm run test:unit --workspace=web` | Unit tests only |
| `npm run test:integration --workspace=web` | Integration tests (needs a running app) |
| `node apps/web/tests/matchmaking.js` | E2E collab-flow test against live Supabase |

### Environment variables (`apps/web/.env.local`)

See `apps/web/.env.example` for the full list: Supabase URL + anon key,
service-role key (server-only), and Stream Chat keys.

### Database

Migrations live in `supabase/migrations/` (numbered `001_…` onward). Apply with:

```bash
supabase db push
```

Edge functions (`supabase/functions/`): `phone-otp` (2Factor SMS OTP), `auth-signup`.

## Deployment (cloud)

**Before deploying, read [docs/operations/DEPLOYMENT.md](docs/operations/DEPLOYMENT.md)** (runbook) and [docs/operations/QA_AND_GO_LIVE.md](docs/operations/QA_AND_GO_LIVE.md) (test script). Short version:

1. **Provision a separate _production_ Supabase project** (do not reuse the dev project `jaajosocopoicmqcffuu`). `supabase link --project-ref <PROD_REF>` then `supabase db push`, and `supabase functions deploy phone-otp auth-signup`.
2. In Supabase Auth, set **Site URL + Redirect URLs** to your production domain and configure the SMTP sender.
3. **Host `apps/web` on Vercel.** Set every env var from `apps/web/.env.example` in the host's secret store — `SUPABASE_SERVICE_ROLE_KEY` and `STREAM_API_SECRET` are **server-only, never `NEXT_PUBLIC`**. Do **not** ship `SUPABASE_ACCESS_TOKEN`.
4. Point the **Stream webhook** at `https://<domain>/api/stream/webhook`.
5. Run the post-deploy smoke test and lifecycle script.

## Documentation

**📖 [docs/README.md](docs/README.md) is the map — start there.** Key entries:

- [docs/product/VISION.md](docs/product/VISION.md) — what Influnet is
- [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) — module reference (canonical)
- [docs/operations/SECURITY.md](docs/operations/SECURITY.md) — auth model, PII lockdown, audit history (read before writing routes/migrations)
- [docs/operations/DEPLOYMENT.md](docs/operations/DEPLOYMENT.md) — cloud deploy runbook
- [docs/operations/QA_AND_GO_LIVE.md](docs/operations/QA_AND_GO_LIVE.md) — manual QA + go-live checklist
- [docs/product/ROADMAP.md](docs/product/ROADMAP.md) — status, backlog, build specs, open decisions
- [.agents/AGENTS.md](.agents/AGENTS.md) — agent working rules

## Branches

- `main` — production
- `dev` — integration branch (default for development)
