# Influnet Mobile

React Native (Expo SDK 57) app sharing the web platform's Supabase project and
`/api/*` routes. See [`docs/architecture/MOBILE_APP_PLAN.md`](../../docs/architecture/MOBILE_APP_PLAN.md)
for the analysis and the full screen-by-screen design rationale.

---

## Running it

```bash
cp .env.example .env.local     # fill in Supabase URL + anon key + API base URL
npm run start                  # from apps/mobile, or `npx expo start`
```

The API base URL must point at a **running web app** — mobile does not talk to
Postgres directly (see "Architecture" below). For a physical device, use your
machine's LAN IP rather than `localhost`.

| Command | What it does |
|---|---|
| `npm run start` | Expo dev server |
| `npm run ios` / `npm run android` | Dev server + open a simulator/emulator |
| `npm run typecheck` | `tsc --noEmit` |
| `npx expo export --platform ios` | Full production bundle — the real build check |

---

## Architecture

```
apps/mobile/
├── app/               expo-router routes (file-based, mirrors the Next mental model)
│   ├── (auth)/        welcome, login, signup wizards, pending-approval
│   ├── (tabs)/        the five role-resolved tabs
│   ├── projects/[id]/ stage timeline + per-stage sign-off
│   └── …              pushed detail screens
├── components/
│   ├── ui/            the design system primitives
│   └── stage-timeline.tsx   the signature screen
└── lib/               theme, supabase, api, session, formatting
```

**Mobile calls the web app's API; it does not query Postgres.** Every rule that
makes the product safe — RLS, the PII column lockdown, rate limits, admin
gating, audit logging — lives in those route handlers. A second client reaching
past them would be a second place to get it wrong. The one exception is
Supabase Realtime in the chat screen, which subscribes to `messages` inserts
that RLS already scopes to the caller.

Shared code lives in `packages/`:

| Package | Contents |
|---|---|
| `@influnet/core` | 12-stage lifecycle, stage guide, deal state, constants, zod validators |
| `@influnet/types` | Database + API types |
| `@influnet/api` | Platform-agnostic `apiFetch` + typed endpoint helpers |
| `@influnet/tokens` | Colours, spacing, radii, type scale, role accents |

---

## Design decisions worth knowing

**Styling is StyleSheet, not NativeWind.** Role accents change at runtime (the
app re-tints itself pink/violet/indigo by role), which is exactly where utility
classes fight you — and it keeps the bundle free of a Babel/Metro transform
that has to track every RN release. Tokens come from `@influnet/tokens` and are
read through `useTheme()`.

**The Kanban board is not ported.** Dragging cards across 12 columns is a
desktop gesture, and it hides what actually matters: a project moves when
*both* sides sign off. `components/stage-timeline.tsx` draws the deal as a
vertical rail with brand on the left and creator on the right, so you can see
the handshake — and see which hand is missing.

**Chat is built on the existing `messages` table + Supabase Realtime**, not
`stream-chat-expo`. The API already reads and writes that table, so a row-insert
subscription is the whole feature. Adopting the Stream RN SDK is a follow-up if
richer chat (threads, reactions, attachments UI) is wanted.

**Admin is deliberately web-only.** Approvals, user management and reports are
dense, low-frequency desk work. Admins signing in get a pointer to the web app.

---

## Not built yet

These are scoped in the plan doc but intentionally absent from this first pass:

- Push notifications (needs a `device_push_tokens` table + a send hook in `notify.ts`)
- Razorpay checkout on the payment stages (payment stages render read-only)
- Stage item uploads / attachments (`expo-image-picker` → existing Cloudinary sign route)
- Profile editing (view + share only)
- Reviews on completion
- Deep links for auth callbacks (scheme is registered; handlers aren't wired)
- Biometric unlock
