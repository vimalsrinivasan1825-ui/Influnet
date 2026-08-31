"use client";

/**
 * The top-right account menu — identity, the multi-account switcher, settings,
 * and sign out. The browser twin of the mobile account switcher sheet.
 *
 * Adding a second account is Pro-gated (client-side product decision, same as
 * mobile — adding an account is just signing in). Switching is free. Signing
 * out REMOVES the account from this browser; if another remains the app
 * switches into it, otherwise it goes to /login.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, LogOut, Plus, Settings, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/auth-store";
import { useEntitlements } from "@/lib/hooks/use-entitlements";
import {
  listWebAccounts,
  recordWebSignIn,
  syncWebActive,
  getStoredWebSession,
  removeWebActive,
  type WebAccountSummary,
} from "@/lib/web-accounts";
import { Avatar } from "@/components/ui/avatar";

export function AccountMenu({
  userName,
  avatarUrl,
  role,
}: {
  userName: string;
  avatarUrl?: string | null;
  role?: string | null;
}) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { enabled: billingEnabled, isPro } = useEntitlements();

  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<WebAccountSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the currently-live account in the book, and its stored session fresh.
  useEffect(() => {
    const sb = createClient();
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) {
        recordWebSignIn(data.session, {
          email: data.session.user.email ?? "",
          name: userName || null,
          avatarUrl: avatarUrl ?? null,
        });
        refresh();
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) syncWebActive(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [userName, avatarUrl]);

  function refresh() {
    const { accounts: list, activeUserId } = listWebAccounts();
    setAccounts(list);
    setActiveId(activeUserId);
  }

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchTo(acct: WebAccountSummary) {
    if (acct.userId === activeId || busy) return;
    const stored = getStoredWebSession(acct.userId);
    if (!stored?.access_token || !stored?.refresh_token) {
      alert("That account needs to be signed into again.");
      return;
    }
    setBusy(acct.userId);
    const sb = createClient();
    const { error } = await sb.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      setBusy(null);
      alert(error.message || "Could not switch to that account.");
      return;
    }
    recordWebSignIn(
      { ...stored } as any,
      { email: acct.email, name: acct.name, avatarUrl: acct.avatarUrl },
    );
    // Full reload — the previous account's data is cached across the tree and
    // the server must re-read the new session cookie.
    window.location.href = "/dashboard";
  }

  function addAccount() {
    if (billingEnabled && !isPro) {
      router.push("/dashboard/billing");
      setOpen(false);
      return;
    }
    window.location.href = "/login?add=1";
  }

  async function handleLogout() {
    setBusy("__logout");
    try {
      await createClient().auth.signOut();
    } catch {
      /* clear local state regardless */
    }
    const next = removeWebActive();
    logout();
    if (next) {
      const stored = getStoredWebSession(next.userId);
      if (stored?.access_token && stored?.refresh_token) {
        await createClient()
          .auth.setSession({
            access_token: stored.access_token,
            refresh_token: stored.refresh_token,
          })
          .catch(() => {});
        window.location.href = "/dashboard";
        return;
      }
    }
    router.push("/login");
  }

  return (
    <div className="relative ml-1 pl-2" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-muted"
        aria-label="Account menu"
      >
        <Avatar name={userName} src={avatarUrl} size="sm" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <Avatar name={userName} src={avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-content">{userName}</p>
              <p className="text-xs text-content-muted">
                {isPro ? "Influnet Pro" : "Signed in"}
              </p>
            </div>
          </div>

          {/* Accounts */}
          <div className="border-b border-hairline p-1.5">
            {accounts.map((a) => (
              <button
                key={a.userId}
                onClick={() => switchTo(a)}
                disabled={!!busy}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                <Avatar name={a.name || a.email} src={a.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-content">
                    {a.name || a.email}
                  </span>
                  {a.name && (
                    <span className="block truncate text-xs text-content-muted">{a.email}</span>
                  )}
                </span>
                {busy === a.userId ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
                ) : a.userId === activeId ? (
                  <Check className="size-4 shrink-0 text-brand" />
                ) : null}
              </button>
            ))}

            <button
              onClick={addAccount}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-content-soft transition-colors hover:bg-surface-muted"
            >
              <span className="grid size-8 place-items-center rounded-full bg-surface-muted">
                {billingEnabled && !isPro ? (
                  <Sparkles className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
              </span>
              {billingEnabled && !isPro ? "Add account — Pro" : "Add another account"}
            </button>
          </div>

          <div className="p-1.5">
            {role !== "admin" && (
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/settings");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-content-soft transition-colors hover:bg-surface-muted hover:text-content"
              >
                <Settings className="size-4" />
                Settings
              </button>
            )}
            <button
              onClick={handleLogout}
              disabled={busy === "__logout"}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
            >
              {busy === "__logout" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
