import { notFound } from "next/navigation";

/**
 * Rewrite target for /dashboard/discover — see next.config.ts. Discover was
 * disabled for V1 launch per client request; this route exists only so old
 * links/bookmarks get a clean not-found instead of a broken page.
 *
 * This can't live at app/dashboard/discover/page.tsx (where the URL would
 * suggest) because everything under app/dashboard/ is wrapped by
 * DashboardShell — a Client Component — and calling notFound() from a Server
 * Component nested inside a Client Component boundary renders the correct
 * not-found UI but does NOT set the response's HTTP status: verified directly
 * (curl a route under dashboard/ vs. a standalone route, both calling
 * notFound()) — the standalone one correctly returns 404, the nested one
 * returns 200. This is the same bug the 2026-07-30 audit found, just moved
 * one layer: fixing discover/page.tsx to call notFound() from a Server
 * Component (the previous fix) was necessary but not sufficient, because the
 * client boundary above it swallowed the status regardless. Living outside
 * app/dashboard/ entirely — with next.config.ts rewriting the public
 * /dashboard/discover URL here — sidesteps the boundary altogether.
 */
export default function DiscoverDisabled() {
  notFound();
}
