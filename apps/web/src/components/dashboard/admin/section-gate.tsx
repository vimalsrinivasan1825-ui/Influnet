"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useAdminAccess } from "@/lib/hooks/use-admin-tier";
import {
  ADMIN_MODULES,
  allows,
  canOpenPage,
  levelFor,
  sectionForPage,
  type AdminAccess,
} from "@/lib/admin-access";

/** The first console page this member may open, in sidebar order. */
function firstOpenPage(access: AdminAccess): string | null {
  for (const m of ADMIN_MODULES) {
    if (allows(access, m.key, "view")) return m.pages[0];
  }
  return null;
}

/**
 * Wraps every /dashboard/admin page so a team member (migration 176) sees an
 * explanation instead of a page of failed requests when it opens a section it
 * was not granted, and a "view only" note on a section it may only read.
 *
 * Presentation, not protection: every request these pages make goes through
 * `withAdmin`, which refuses the same thing server-side.
 */
export function AdminSectionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/dashboard/admin";
  const router = useRouter();
  const { access, loading } = useAdminAccess();

  const open = access ? canOpenPage(access, pathname) : false;
  const fallback = access ? firstOpenPage(access) : null;
  const atHome = pathname.replace(/\/+$/, "") === "/dashboard/admin";

  // Landing on the console home without Overview: go to the first section
  // this member holds rather than greeting them with a refusal.
  useEffect(() => {
    if (access && !open && atHome && fallback && fallback !== "/dashboard/admin") {
      router.replace(fallback);
    }
  }, [access, open, atHome, fallback, router]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <ShieldCheck className="size-6 animate-pulse text-content-muted" />
          <p className="text-xs text-content-muted">Checking your access…</p>
        </div>
      </div>
    );
  }

  if (!access) {
    return (
      <Refusal
        title="No console access"
        body="Your account is not an active member of the admin team, or it has been disabled. Ask the person who added you."
      />
    );
  }

  if (access.tier === "super") return <>{children}</>;

  if (!open) {
    if (atHome && fallback) return null; // redirecting
    const section = sectionForPage(pathname);
    const label =
      section.kind === "module" ? ADMIN_MODULES.find((m) => m.key === section.module)?.label : null;
    return (
      <Refusal
        title={section.kind === "developer" ? "Developer access required" : "You don't have access to this section"}
        body={
          section.kind === "developer"
            ? "Technical infrastructure is limited to super administrators and cannot be delegated."
            : `${label ?? "This section"} was not included in your access. Ask the person who added you to the team if you need it.`
        }
        backHref={fallback}
      />
    );
  }

  const section = sectionForPage(pathname);
  const viewOnly = section.kind === "module" && levelFor(access, section.module) === "view";

  return (
    <>
      {viewOnly && (
        <div className="mx-auto mt-4 flex max-w-7xl items-center gap-2 px-4 sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-content-soft">
            <Eye className="size-3.5" />
            View only — you can look, but changes here are turned off for your account.
          </span>
        </div>
      )}
      {children}
    </>
  );
}

function Refusal({ title, body, backHref }: { title: string; body: string; backHref?: string | null }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-warn/10 text-warn ring-8 ring-warn/5">
        <Lock className="size-7" />
      </div>
      <h2 className="text-xl font-bold text-content">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-content-soft">{body}</p>
      {backHref && (
        <div className="mt-6">
          <ButtonLink href={backHref} variant="brand" size="default">
            Go to your console
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
