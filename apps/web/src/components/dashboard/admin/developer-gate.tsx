"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Terminal } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export function isUserSuperAdmin(user: { email?: string | null; is_super_admin?: boolean } | null): boolean {
  if (!user) return false;
  if (user.is_super_admin === true) return true;
  if (!user.email) return false;
  const email = user.email.toLowerCase().trim();
  return email === "dev.admin@influnet.io" || email.startsWith("dev.admin@");
}

export function DeveloperGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      // Fast check from local user store
      if (isUserSuperAdmin(user as any)) {
        if (mounted) {
          setIsSuper(true);
          setChecking(false);
        }
        return;
      }

      // Check current session & database profile
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          if (mounted) setChecking(false);
          return;
        }

        if (isUserSuperAdmin(session.user as any)) {
          if (mounted) {
            setIsSuper(true);
            setChecking(false);
          }
          return;
        }

        const { data: rawProfile } = await sb
          .from("profiles")
          .select("is_super_admin, role")
          .eq("id", session.user.id)
          .single();

        const profile = rawProfile as { role?: string; is_super_admin?: boolean } | null;

        if (mounted) {
          if (profile?.role === "admin" && profile?.is_super_admin === true) {
            setIsSuper(true);
          } else {
            setIsSuper(false);
          }
          setChecking(false);
        }
      } catch {
        if (mounted) setChecking(false);
      }
    }

    check();

    return () => {
      mounted = false;
    };
  }, [user]);

  if (checking) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Terminal className="size-6 animate-pulse text-content-muted" />
          <p className="text-xs text-content-muted">Verifying developer credentials…</p>
        </div>
      </div>
    );
  }

  if (!isSuper) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-warn/10 text-warn ring-8 ring-warn/5">
          <ShieldAlert className="size-7" />
        </div>
        <h2 className="text-xl font-bold text-content">Developer Access Required</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-content-soft">
          This section contains technical infrastructure, circuit breakers, and backend system
          diagnostics reserved for developer administrators (<code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-mono font-bold text-brand">dev.admin@influnet.io</code>).
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
