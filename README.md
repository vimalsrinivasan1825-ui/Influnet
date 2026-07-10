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

## Documentation

- [docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md) — full codebase analysis & state
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module reference
- [.agents/EXECUTION_PLAN.md](.agents/EXECUTION_PLAN.md) — active work order (phased tasks)
- [docs/SUPABASE.md](docs/SUPABASE.md) — Supabase project setup
- [docs/PHONE_OTP_SETUP.md](docs/PHONE_OTP_SETUP.md) — SMS OTP configuration

## Branches

- `main` — production
- `dev` — integration branch (default for development)
