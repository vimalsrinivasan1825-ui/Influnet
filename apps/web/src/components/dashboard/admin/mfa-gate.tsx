"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";

/**
 * Two-factor authentication for the admin console.
 *
 * An admin password opens every user's email, phone and payments and can push
 * a message to every real user through Broadcasts. This gate makes that
 * password insufficient on its own.
 *
 *   session already aal2          → the console
 *   enrolled, signed in at aal1   → enter the 6-digit code
 *   not enrolled, server requires → set up an authenticator (no way round it)
 *   not enrolled, not required    → the console, with a "set it up" banner
 *
 * The decision that matters is server-side: `withAdmin` refuses every
 * /api/admin call without aal2 for an enrolled admin, and for everyone once
 * ADMIN_REQUIRE_MFA is on (see adminMfaProblem in lib/api.ts). This component
 * only decides which screen to draw.
 *
 * A lost authenticator is reset by the owner with scripts/reset-admin-mfa.mjs.
 */

type State =
  | { kind: "checking" }
  | { kind: "ok"; suggestEnroll: boolean }
  | { kind: "challenge"; factorId: string }
  | { kind: "enroll"; forced: boolean };

export function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (aal?.currentLevel === "aal2") return setState({ kind: "ok", suggestEnroll: false });

      if (aal?.nextLevel === "aal2") {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const factor = factors?.totp?.find((f) => f.status === "verified");
        if (cancelled) return;
        if (factor) return setState({ kind: "challenge", factorId: factor.id });
      }

      // Not enrolled. Whether that is allowed is the server's call — ask it
      // rather than mirror ADMIN_REQUIRE_MFA into the browser bundle.
      const res = await apiFetch<{ code?: string }>("/api/admin/tier", { cache: "no-store" });
      if (cancelled) return;
      if (res.status === 403 && res.data?.code === "mfa_enroll_required") {
        setState({ kind: "enroll", forced: true });
      } else {
        setState({ kind: "ok", suggestEnroll: true });
      }
    })().catch(() => {
      // If the check itself fails, draw the console: every request it makes
      // is still refused server-side when a second factor is owed.
      if (!cancelled) setState({ kind: "ok", suggestEnroll: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "checking") {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <ShieldCheck className="size-6 animate-pulse text-content-muted" />
          <p className="text-xs text-content-muted">Checking your sign-in…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "challenge") return <Challenge factorId={state.factorId} />;

  if (state.kind === "enroll") {
    return (
      <Enroll
        forced={state.forced}
        onCancel={state.forced ? undefined : () => setState({ kind: "ok", suggestEnroll: true })}
      />
    );
  }

  return (
    <>
      {state.suggestEnroll && (
        <div className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-3 px-4 sm:px-6">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-content">
            <ShieldAlert className="size-4 shrink-0 text-warn" />
            <span className="flex-1">
              Your admin account is protected by a password only. Add an authenticator app so a leaked
              password can&apos;t open the console.
            </span>
            <Button size="sm" variant="brand" onClick={() => setState({ kind: "enroll", forced: false })}>
              Set up two-factor
            </Button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

/** Six digits, digits only. */
function useCode() {
  const [code, setCode] = useState("");
  const onChange = (v: string) => setCode(v.replace(/\D/g, "").slice(0, 6));
  return { code, onChange, complete: code.length === 6 };
}

function Card({ title, body, children }: { title: string; body: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-8 ring-brand/5">
        <KeyRound className="size-7" />
      </div>
      <h2 className="text-xl font-bold text-content">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-content-soft">{body}</div>
      <div className="mt-6 w-full">{children}</div>
    </div>
  );
}

function CodeForm({
  onSubmit,
  busy,
  error,
  submitLabel,
}: {
  onSubmit: (code: string) => void;
  busy: boolean;
  error: string;
  submitLabel: string;
}) {
  const { code, onChange, complete } = useCode();
  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete && !busy) onSubmit(code);
      }}
    >
      <Label htmlFor="mfa-code">6-digit code</Label>
      <Input
        id="mfa-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={(e) => onChange(e.target.value)}
        placeholder="123456"
        className="text-center font-mono text-lg tracking-[0.4em]"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="brand" disabled={!complete || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
      </Button>
    </form>
  );
}

function Challenge({ factorId }: { factorId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verify = async (code: string) => {
    setBusy(true);
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setBusy(false);
      setError("That code didn't match. Codes change every 30 seconds — try the current one.");
      return;
    }
    // A full reload: the sidebar, access cache and every open request were set
    // up with the password-only session, and all of them should start again
    // with the upgraded one.
    window.location.reload();
  };

  return (
    <Card
      title="Enter your authenticator code"
      body="Open your authenticator app and enter the 6-digit code for Influnet admin."
    >
      <CodeForm onSubmit={verify} busy={busy} error={error} submitLabel="Verify" />
      <p className="mt-6 text-xs text-content-muted">
        Lost your phone? Ask the account owner to reset your second factor.
      </p>
    </Card>
  );
}

function Enroll({ forced, onCancel }: { forced: boolean; onCancel?: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [startError, setStartError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setStartError("");
    const sb = createClient();
    // An abandoned earlier attempt leaves an unverified factor behind, and a
    // second enrol with the same name is refused. Clear those first.
    const { data: existing } = await sb.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Influnet admin",
      issuer: "Influnet",
    });
    if (err || !data) {
      setStartError(
        "Could not start setup. If this keeps happening, TOTP may be switched off for this project (Supabase → Authentication → Multi-Factor).",
      );
      return;
    }
    setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const verify = async (code: string) => {
    if (!factor) return;
    setBusy(true);
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (err) {
      setBusy(false);
      setError("That code didn't match. Check the time on your phone is set automatically, then try the current code.");
      return;
    }
    window.location.reload();
  };

  return (
    <Card
      title={forced ? "Set up two-factor to continue" : "Set up two-factor"}
      body={
        <>
          Scan this with Google Authenticator, Microsoft Authenticator, 1Password or any authenticator
          app, then enter the code it shows.
          {forced && " The admin console requires it for every team member."}
        </>
      }
    >
      {startError && <p className="mb-4 text-sm text-danger">{startError}</p>}
      {!factor && !startError && (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-content-muted" />
        </div>
      )}
      {factor && (
        <>
          <div className="mx-auto mb-3 w-48 rounded-xl bg-white p-3">
            {/* A data: URL SVG from Supabase — next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={factor.qr} alt="QR code for your authenticator app" className="size-full" />
          </div>
          <p className="mb-5 text-xs text-content-muted">
            Can&apos;t scan? Enter this key instead:{" "}
            <code className="select-all break-all font-mono text-content">{factor.secret}</code>
          </p>
          <CodeForm onSubmit={verify} busy={busy} error={error} submitLabel="Turn on two-factor" />
        </>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel} className="mt-4 text-xs text-content-muted underline">
          Not now
        </button>
      )}
    </Card>
  );
}
