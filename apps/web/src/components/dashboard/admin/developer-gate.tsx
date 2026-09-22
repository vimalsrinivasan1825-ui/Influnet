"use client";

import { ArrowLeft, ShieldAlert, Terminal } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useAdminTier } from "@/lib/hooks/use-admin-tier";

/**
 * Wraps the technical admin screens (health, vendors, rate limits, emails,
 * audit, issues) so a Business / Client admin sees an explanation instead of a
 * page of failed requests.
 *
 * This is presentation, not protection: every one of those screens reads from
 * a route guarded by `withSuperAdmin`, which answers 403 regardless of what
 * this component renders.
 */
export function DeveloperGate({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useAdminTier();

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Terminal className="size-6 animate-pulse text-content-muted" />
          <p className="text-xs text-content-muted">Verifying developer access…</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-warn/10 text-warn ring-8 ring-warn/5">
          <ShieldAlert className="size-7" />
        </div>
        <h2 className="text-xl font-bold text-content">Developer access required</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-content-soft">
          This section holds technical infrastructure, circuit breakers and backend
          diagnostics. It is limited to developer administrators — ask one to grant
          access with <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">scripts/create-admin.mjs --super</code>.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <ButtonLink href="/dashboard/admin" variant="brand" size="default">
            <ArrowLeft /> Return to Control Center
          </ButtonLink>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
