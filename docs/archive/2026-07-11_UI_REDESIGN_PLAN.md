# UI Redesign — Remaining Work Plan
**Branch:** `ui/redesign`
**Date:** 2026-07-11
**Scope:** Pick up exactly where Claude Code stopped (token limit hit during iteration 4)

---

## Design System Reference (what's already in place)

### CSS Tokens (from `globals.css` `:root`)
```
Surface:  --surface (#f6f7f9) | --surface-card (#fff) | --surface-muted (#f8fafc)
Borders:  --hairline (#eef0f4) | --hairline-strong (#e3e6ec)
Text:     --content (#0f172a) | --content-soft (#475569) | --content-muted (#94a3b8)
Brand:    --brand (#ee3e96) | --brand-2 (#f26e59) | --brand-strong (#d6358a)
          --brand-soft (#fdf2f8)
Status:   --ok / --ok-soft | --warn / --warn-soft | --danger / --danger-soft
Shadows:  --shadow-card | --shadow-raised | --shadow-pop
```

### Tailwind aliases (use these in className):
```
bg-surface        bg-surface-card       bg-surface-muted
border-hairline   border-hairline-strong
text-content      text-content-soft     text-content-muted
text-brand        text-brand-strong     bg-brand-soft
shadow-[var(--shadow-card)]   shadow-[var(--shadow-raised)]
```

### UI Primitives available (`components/ui/`):
- `Button` — props: `variant="brand"|"ghost"|"outline"`, `size="sm"|"md"|"xl"`
- `Input` + `Label` — styled form fields
- `Badge` — small colored tags
- `Avatar` — circular avatar with fallback initials
- `Card` + `SectionCard` — rounded containers
- `PageHeader` — page title + subtitle block
- `EmptyState` — empty content placeholder
- `Skeleton` — loading skeleton

### Pattern: Auth Pages (no dashboard chrome)
Follow login page pattern exactly:
- Wrapper: `bg-surface min-h-screen flex items-center justify-center overflow-hidden`
- Ambient blobs: two `absolute` divs with `radial-gradient(circle, var(--brand), transparent 70%)` + blur
- Card: `rounded-3xl border border-hairline bg-surface-card p-8 shadow-[var(--shadow-raised)]`
- Error banner: `border border-danger/20 bg-danger-soft text-danger rounded-xl`
- Links: `text-brand hover:text-brand-strong font-bold`

### Pattern: Public Profile Pages (c/ and b/)
Standalone pages (no dashboard sidebar):
- Page body: `bg-surface min-h-screen`
- Sticky header: `bg-surface-card border-b border-hairline sticky top-0 z-50`
- Content cards: `rounded-3xl border border-hairline bg-surface-card shadow-[var(--shadow-card)]`
- CTA: `Button variant="brand"` or inline token-based gradient
- All hardcoded hex colors replaced with tokens

---

## Tasks (in order)

### Task 1 — reset-password ✅ WRITTEN (needs commit)
**File:** `apps/web/src/app/reset-password/page.tsx`
**Status:** Already ported in this session — Button/Input/Label primitives, CSS tokens, ambient blobs.
**Logic preserved:** 4 modes (request/sent/update/done), recovery event listener, error handling.
**Action:** Commit only.

---

### Task 2 — Creator Public Profile (`c/[username]`)
**File:** `apps/web/src/app/c/[username]/page.tsx`
**Current:** 312 lines. Working logic. Hardcoded `bg-[#fafafb]`, `text-slate-*`, `text-[#ee3e96]`, `border-slate-100`.

**Surgical token swaps only:**
1. Page bg: `bg-[#fafafb]` → `bg-surface`
2. Cards: `bg-white border-slate-100` → `bg-surface-card border-hairline`
3. Text: `text-slate-900` → `text-content`, `text-slate-500` → `text-content-soft`, `text-slate-400` → `text-content-muted`
4. CTA link: `bg-[#ee3e96] hover:bg-[#db2777]` → wrap in `Button variant="brand"`
5. Niche chips: `bg-slate-50 border-slate-100 text-slate-700` → `bg-surface-muted border-hairline text-content-soft`
6. Social links hover: `hover:text-[#ee3e96]` → `hover:text-brand`
7. Verified icon: `text-[#ee3e96]` → `text-brand`
8. Avatar: `<img>` → `Image` from next/image

**Logic untouched:** data fetching, profile view recording, CTA role logic, stats, social handles.

---

### Task 3 — Business Public Profile (`b/[username]`)
**File:** `apps/web/src/app/b/[username]/page.tsx`
**Current:** 183 lines. Working logic. Hardcoded `#ee3e96`, `#0f172a`, `#475569`, `#e2e8f0`.

**Surgical token swaps only:**
1. Page bg: `bg-[#fafafb]` → `bg-surface`
2. Sticky header: `bg-white border-[#e2e8f0]` → `bg-surface-card border-hairline`
3. Header links: `text-[#475569]` → `text-content-soft hover:text-content`
4. Header CTA: hardcoded pink rounded-full → `Button variant="brand" size="sm"`
5. All cards: `bg-white border-[#e2e8f0]` → `bg-surface-card border-hairline`
6. Text: `#0f172a` → `text-content`, `#475569` → `text-content-soft`, `#64748b` → `text-content-muted`
7. Meta pill tags: hardcoded → `bg-surface-muted border-hairline`
8. Verified badge: `bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]` → `bg-ok-soft text-ok`
9. Sticky CTA card button: gradient link → `Button variant="brand" className="w-full"`
10. Icon accents: `text-[#ee3e96]` → `text-brand`

**Logic untouched:** server-side fetching, CTA role logic, all data rendering.

---

### Task 4 — `influnet/[slug]` Route
**File:** `apps/web/src/app/influnet/[slug]/page.tsx` — DOES NOT EXIST YET
**What it is:** The "link-in-bio" URL creators share on Instagram etc. e.g. `influnet.com/influnet/vimal2123`.
**What to build:** Server component — fetch `get_public_influencer(p_slug)` → if found, `redirect('/c/' + profile.username)`. If not found → `notFound()`. Pure redirect, no UI.

---

### Task 5 — Final Build + Wiring Audit
1. `npm run build --workspace=web` — must be clean
2. `npx tsc --noEmit` — zero type errors
3. Confirm every page's API routes exist
4. Single commit for any last fixes
5. Update `lessons_learned.md` + `architecture.html`

---

## Status Tracker
- [x] Task 1 — reset-password commit (d0c71432)
- [x] Task 2 — c/[username] token swap + commit (e328d245)
- [x] Task 3 — b/[username] token swap + commit (17c0afee)
- [x] Task 4 — influnet/[slug] redirect + commit (9fcabd98)
- [x] Task 5 — build + audit + commit ✅ 47 routes, 0 errors (2026-07-11)
