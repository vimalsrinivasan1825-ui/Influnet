import Link from "next/link";
import Image from "next/image";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/**
 * Was hardcoded to light-mode-only colors (bg-[#fafafb], text-gray-900, a
 * fixed pink) instead of the app's semantic tokens (bg-surface, text-content,
 * var(--brand)) — inconsistent with every other page and broken-looking in
 * dark mode. Rebuilt on the same design system, and reusing the ambient-glow
 * background the auth pages already establish as the site's look for a
 * full-screen moment like this.
 *
 * A single "Go home" link is deliberate: "/" already redirects to /login for
 * anonymous visitors and /login bounces a signed-in user straight to
 * /dashboard, so one link correctly serves both cases without this page
 * needing to know who's asking.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        <div
          className="absolute -left-40 -top-40 size-[32rem] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 size-[32rem] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--brand-2), transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
          <Image src="/influet_logo.png" alt="" width={36} height={36} className="size-9" priority />
          <span className="text-2xl font-extrabold tracking-tight text-content">influnet</span>
        </Link>

        <div className="w-full rounded-3xl border border-hairline bg-surface-card p-10 shadow-[var(--shadow-soft)]">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-brand-soft">
            <Compass size={30} className="text-brand-strong" />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">404</p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-content">Page not found</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-content-soft">
            The page you're looking for doesn't exist, moved, or the link was mistyped.
          </p>

          <ButtonLink href="/" variant="brand" size="xl" className="mt-7 w-full">
            Go home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
