# Influnet landing — design system

Read this before changing anything under `apps/landing`. It is the single source
for how the landing looks and moves. Tokens live in `src/app/globals.css`; use the
Tailwind names (`bg-paper`, `text-ink`, `text-brand`…), never raw `gray-*`.

## Idea

Influnet is the business side of a creator's work. The page should feel like a
calm, confident studio — paper and ink — with one hot-pink signal that means
"this is where the deal lives". The logo (a ring with four nodes on spokes) is
the recurring motif: a profile at the centre, everything connected to it.

## Colour

| Token | Hex | Use |
|---|---|---|
| `paper` | `#fbfaf8` | Page ground on light sections |
| `paper-deep` | `#f4f2ee` | Inset panels, chips |
| `ink` | `#17141d` | Text, primary buttons |
| `ink-soft` | `#4a4552` | Body copy, captions (passes 4.5:1 on paper) |
| `night` | `#141118` | Dark sections (hero, final CTA) |
| `night-soft` | `#c9c1d1` | Body copy on night |
| `brand` | `#ff078e` | The logo pink. Shapes, large type, fills behind **ink** text |
| `brand-deep` | `#c8307f` | Pink behind **white** text (≥18px bold), pink text on paper |
| `magenta-tint` | `#fdeef6` | Soft pink chips |
| `verified` | `#0e9f6e` / text `#0b7a55` | Only for real verification states |

Rules: one pink moment per viewport. Never pink body text on white below 18px bold.
No gradient washes on backgrounds; a blurred glow on night sections is fine. The one
deliberate exception is the **feature trio** (`brands/why-trio.tsx`): three saturated
gradient cards (pink, indigo, orange) with a large faded number, borrowed from Influish.
Keep it to one trio per page.

## Type

- Display: **Bricolage Grotesque** 700–800, tight tracking (−0.03 to −0.045em), line-height ~1.
- Body: **Instrument Sans** 400–600, 17–20px on marketing copy.
- Labels: **Spline Sans Mono** 500, 11–12px, uppercase, 0.14em tracking, written as `[ Label ]`.

## Motion

GSAP (with ScrollTrigger, SplitText, DrawSVG) drives every section; Lenis gives
smooth scroll. Framer Motion remains only in the older business components.

- **Feel like motion graphics, not UI transitions.** Masked line reveals for
  headlines (text rises from behind a mask), elements that hand off to each other
  (a DM becomes a request card), camera-like zooms, parallax depth. No plain
  fade-up-everything.
- **Easing:** `expo.out` / `power4.out` for entrances, `expo.inOut` for camera
  moves, `back.out(1.7)` only for small pops (nodes, badges). Nothing linear except
  marquees and loops.
- **Durations:** 0.6–1.2s entrances, stagger 0.04–0.08s per word/item.
- **Scroll:** a section animates once when it enters the viewport, then plays as a
  timed sequence and pauses when it leaves. No pinning (see Section vocabulary).
- **Reduced motion:** every timeline checks `prefers-reduced-motion` and jumps to
  its end state. Content must be readable with animation off.
- **Loops** (rotating logo, floating pills) are slow (20s+ rotations, 4–6s bobs)
  and pause off-screen.

## Section vocabulary

Shared blocks live in `src/components/site/` and take their content as props, so both
pages use the same parts: `nav`, `kinetic-words` (the moving word rows — keep them),
`compare` (Apple-style table with a lit Influnet column), `statement` (words light up as
you read), `faq`, `final-cta`, `links`.

- **Heroes** are dark, with a live object in the centre (a creator profile card, a
  campaign card) and features connected to it: spokes and signals on the creator side,
  orbiting creators on the brand side. The object cycles through examples.
- **Steppers** (`creators/collab-track`, `brands/campaign-steps`) auto-advance while on
  screen, can be clicked, and give every step its own colour and animated mockup.
- **Story sections** play by themselves when they come into view. The owner does not want
  scroll-pinned, scrub-to-play sections; the statement's word-by-word light-up is the
  only scroll-linked effect, and it never pins.

## Honesty rule

Only show what the product does today. Before adding a feature line, number or
badge, check it in `apps/web`. Current no-go words: escrow, automated payouts,
government ID, rate card/packages, LinkedIn, any user or business counts.

## Routes

- `/` — gateway: logo intro → "Creator or Business?" → chosen page. The choice is
  stored in `localStorage['influnet.role']`; returning visitors skip straight to it.
- `/creators` — creator page (`src/components/creators/`).
- `/business` — brand page (`src/components/business-page.tsx`, `src/components/brands/`).
  The old page's components in `src/components/landing/` are no longer rendered.
