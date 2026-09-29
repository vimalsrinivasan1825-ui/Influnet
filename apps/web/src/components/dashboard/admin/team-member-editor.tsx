"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ADMIN_MODULES,
  FIELD_GROUPS,
  grantProblem,
  type AdminAccess,
  type AdminLevel,
} from "@/lib/admin-access";

export type Tier = "admin" | "staff";

export interface EditorValue {
  name: string;
  email: string;
  tier: Tier;
  permissions: Record<string, AdminLevel>;
  hiddenFields: string[];
  delivery: "invite" | "password";
}

export type Credentials =
  | { kind: "invite"; link: string }
  | { kind: "password"; password: string }
  | { kind: "failed"; reason: string };

const LEVELS: Array<{ value: AdminLevel | null; label: string }> = [
  { value: null, label: "None" },
  { value: "view", label: "View" },
  { value: "manage", label: "Manage" },
];
const RANK = { view: 1, manage: 2 } as const;

/** Sections grouped the way the sidebar shows them. */
const GROUPS = ADMIN_MODULES.reduce<Array<{ label: string; modules: typeof ADMIN_MODULES }>>((acc, m) => {
  const g = acc.find((x) => x.label === m.group);
  if (g) g.modules.push(m);
  else acc.push({ label: m.group, modules: [m] });
  return acc;
}, []);

/**
 * Create or edit a team member's access.
 *
 * Whatever the signed-in member cannot grant is shown locked rather than
 * hidden, so they can see why: a level above their own, a section they do not
 * hold, a field that is hidden from them. The server re-checks all of it.
 */
export function TeamMemberEditor({
  mode,
  actor,
  creatableTiers,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  actor: AdminAccess;
  creatableTiers: Tier[];
  initial: EditorValue;
  onClose: () => void;
  onSubmit: (v: EditorValue) => Promise<{ error?: string; credentials?: Credentials }>;
}) {
  const [v, setV] = useState<EditorValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);

  const actorLevel = (key: string): number =>
    actor.tier === "super" ? 2 : actor.permissions[key] ? RANK[actor.permissions[key]] : 0;

  const setLevel = (key: string, level: AdminLevel | null) =>
    setV((prev) => {
      const permissions = { ...prev.permissions };
      if (level) permissions[key] = level;
      else delete permissions[key];
      return { ...prev, permissions };
    });

  const setTier = (tier: Tier) =>
    setV((prev) => {
      // Staff never hold Team; drop it rather than leave an unsavable form.
      const permissions = { ...prev.permissions };
      if (tier === "staff") delete permissions.team;
      return { ...prev, tier, permissions };
    });

  const grantAll = (level: AdminLevel) =>
    setV((prev) => {
      const permissions: Record<string, AdminLevel> = {};
      for (const m of ADMIN_MODULES) {
        if (m.key === "team" && prev.tier === "staff") continue;
        const cap = actorLevel(m.key);
        if (cap === 0) continue;
        permissions[m.key] = level === "manage" && cap === 2 ? "manage" : "view";
      }
      return { ...prev, permissions };
    });

  const problem = useMemo(() => {
    if (mode === "create" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return "Enter the email they will sign in with.";
    if (!v.name.trim()) return "Enter their name.";
    return grantProblem(actor, v.tier, v.permissions, v.hiddenFields);
  }, [actor, mode, v]);

  const held = Object.keys(v.permissions).length;

  async function submit() {
    if (problem) return;
    setSaving(true);
    setError(null);
    const res = await onSubmit(v);
    setSaving(false);
    if (res.error) setError(res.error);
    else if (res.credentials) setCredentials(res.credentials);
    else onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-content/35 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-editor-title"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)] sm:max-w-3xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div>
            <h2 id="team-editor-title" className="text-base font-bold text-content">
              {credentials ? "Account ready" : mode === "create" ? `Add ${v.tier === "admin" ? "an admin" : "staff"}` : `Edit ${initial.name || "access"}`}
            </h2>
            {!credentials && (
              <p className="text-xs text-content-muted">
                {held} section{held === 1 ? "" : "s"} · {v.hiddenFields.length} field group{v.hiddenFields.length === 1 ? "" : "s"} hidden
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-full p-1.5 text-content-muted transition-colors hover:bg-surface-subtle hover:text-content disabled:opacity-40"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {credentials ? (
          <CredentialsPanel credentials={credentials} email={v.email} onDone={onClose} />
        ) : (
          <>
            <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
              {/* Identity */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tm-name">Name</Label>
                  <Input id="tm-name" value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tm-email">Sign-in email</Label>
                  <Input
                    id="tm-email"
                    type="email"
                    value={v.email}
                    disabled={mode === "edit"}
                    placeholder="name@company.com"
                    onChange={(e) => setV({ ...v, email: e.target.value })}
                  />
                  {mode === "create" && (
                    <p className="text-[0.6875rem] text-content-muted">Must be a new address — existing creator or business accounts can't be converted.</p>
                  )}
                </div>
              </div>

              {/* Tier */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-content-soft">Account type</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["admin", "staff"] as Tier[]).map((t) => {
                    const allowed = creatableTiers.includes(t) || (mode === "edit" && t === initial.tier && actor.tier === "super");
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={!allowed}
                        onClick={() => setTier(t)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors",
                          v.tier === t ? "border-brand bg-brand-soft" : "border-hairline hover:border-hairline-strong",
                          !allowed && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-content">
                          {t === "admin" ? "Admin" : "Staff"}
                          {!allowed && <Lock className="size-3.5 text-content-muted" />}
                        </span>
                        <span className="text-xs text-content-soft">
                          {t === "admin"
                            ? "Can be given Team access to add staff — never other admins."
                            : "Works inside the sections you pick. Can't add anyone."}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sections */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-content-soft">Sections</p>
                    <p className="text-[0.6875rem] text-content-muted">View reads a section. Manage also changes things in it.</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => grantAll("view")}>All view</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => grantAll("manage")}>All manage</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setV({ ...v, permissions: {} })}>Clear</Button>
                  </div>
                </div>
                {GROUPS.map((g) => (
                  <div key={g.label} className="rounded-2xl border border-hairline">
                    <p className="border-b border-hairline px-4 py-2 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-content-muted">
                      {g.label}
                    </p>
                    <ul className="divide-y divide-hairline">
                      {g.modules.map((m) => {
                        const cap = actorLevel(m.key);
                        const staffTeam = m.key === "team" && v.tier === "staff";
                        const current = v.permissions[m.key] ?? null;
                        return (
                          <li key={m.key} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-content">{m.label}</p>
                              <p className="text-xs text-content-muted">
                                {staffTeam ? "Staff can't be given Team access." : m.description}
                              </p>
                            </div>
                            <div role="radiogroup" aria-label={`${m.label} access`} className="flex shrink-0 self-start rounded-xl bg-surface-muted p-0.5 sm:self-auto">
                              {LEVELS.map((l) => {
                                const need = l.value ? RANK[l.value] : 0;
                                const locked = need > cap || (staffTeam && need > 0);
                                const on = current === l.value;
                                return (
                                  <button
                                    key={l.label}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    disabled={locked}
                                    title={locked && !staffTeam ? "Beyond your own access" : undefined}
                                    onClick={() => setLevel(m.key, l.value)}
                                    className={cn(
                                      "min-w-16 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                                      on ? "bg-surface-card text-content shadow-sm" : "text-content-soft hover:text-content",
                                      locked && "cursor-not-allowed opacity-40 hover:text-content-soft",
                                    )}
                                  >
                                    {l.label}
                                  </button>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <p className="text-[0.6875rem] text-content-muted">
                  System health, vendors, rate limits, email, audit log and issues stay with super admins and can't be granted.
                </p>
              </div>

              {/* Fields */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-soft">Fields they can see</p>
                  <p className="text-[0.6875rem] text-content-muted">A hidden field reads “Hidden” everywhere in the console and in CSV exports, and can't be edited.</p>
                </div>
                <ul className="divide-y divide-hairline rounded-2xl border border-hairline">
                  {FIELD_GROUPS.map((f) => {
                    const forced = actor.hiddenFields.includes(f.key);
                    const visible = !v.hiddenFields.includes(f.key);
                    return (
                      <li key={f.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-content">
                            {f.label}
                            {forced && <Lock className="size-3.5 text-content-muted" />}
                          </p>
                          <p className="text-xs text-content-muted">{forced ? "Hidden from you, so it stays hidden for them." : f.description}</p>
                        </div>
                        <Switch
                          label={`${f.label} visible`}
                          checked={visible}
                          disabled={forced}
                          onCheckedChange={(on) =>
                            setV((prev) => ({
                              ...prev,
                              hiddenFields: on ? prev.hiddenFields.filter((h) => h !== f.key) : [...prev.hiddenFields, f.key],
                            }))
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Delivery */}
              {mode === "create" && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-soft">How they sign in</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DeliveryOption
                      active={v.delivery === "invite"}
                      onClick={() => setV({ ...v, delivery: "invite" })}
                      icon={<Link2 className="size-4" />}
                      title="Set-password link"
                      body="A one-time link they open to choose their own password. Recommended."
                    />
                    <DeliveryOption
                      active={v.delivery === "password"}
                      onClick={() => setV({ ...v, delivery: "password" })}
                      icon={<KeyRound className="size-4" />}
                      title="Generated password"
                      body="Shown to you once. Share it privately and have them change it."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn("text-xs", error || problem ? "font-semibold text-danger" : "text-content-muted")}>
                {error ?? problem ?? "Access takes effect on their next request."}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="button" variant="brand" onClick={submit} disabled={saving || !!problem}>
                  {saving && <Loader2 className="animate-spin" />}
                  {mode === "create" ? "Create account" : "Save access"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeliveryOption({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
        active ? "border-brand bg-brand-soft" : "border-hairline hover:border-hairline-strong",
      )}
    >
      <span className="mt-0.5 text-brand">{icon}</span>
      <span>
        <span className="block text-sm font-bold text-content">{title}</span>
        <span className="block text-xs text-content-soft">{body}</span>
      </span>
    </button>
  );
}

/** Shown once, straight after the account is created or its access reset. */
export function CredentialsPanel({ credentials, email, onDone }: { credentials: Credentials; email: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const secret = credentials.kind === "invite" ? credentials.link : credentials.kind === "password" ? credentials.password : null;

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the value is selectable */
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {credentials.kind === "failed" ? (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          The account exists, but a sign-in {email ? `for ${email} ` : ""}could not be issued ({credentials.reason}). Use “New sign-in link” on the Team page to try again.
        </p>
      ) : (
        <>
          <p className="text-sm text-content-soft">
            {credentials.kind === "invite"
              ? "Send this one-time link to them privately. It expires, and it's the only time it will be shown."
              : "This password is shown once and is not stored anywhere. Share it privately and ask them to change it after signing in."}
          </p>
          <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-muted px-3 py-2.5">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-content">{secret}</code>
            <Button type="button" variant="surface" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="brand" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
