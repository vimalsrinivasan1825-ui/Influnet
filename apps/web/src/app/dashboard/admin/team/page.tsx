"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, ShieldCheck, Terminal, UserCog, UsersRound } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminPage, dateOnly } from "@/components/dashboard/admin/kit";
import {
  CredentialsPanel,
  TeamMemberEditor,
  type Credentials,
  type EditorValue,
  type Tier,
} from "@/components/dashboard/admin/team-member-editor";
import { ADMIN_MODULES, FIELD_GROUPS, type AdminAccess, type AdminLevel } from "@/lib/admin-access";
import { invalidateAdminAccess } from "@/lib/hooks/use-admin-tier";

/**
 * Team & roles (migration 176).
 *
 * A super admin adds admins and staff and decides, section by section, what
 * each can view or manage and which fields are hidden from them. An admin
 * with Team access adds staff from within its own access. Envelope:
 * GET /api/admin/team → { me, members, supers }.
 */

interface Member {
  user_id: string;
  email: string | null;
  name: string | null;
  tier: Tier;
  permissions: Record<string, AdminLevel>;
  hidden_fields: string[];
  disabled: boolean;
  created_at: string;
  created_by_name: string | null;
  manageable: boolean;
}

interface TeamResponse {
  me: {
    user_id: string;
    tier: AdminAccess["tier"];
    permissions: Record<string, AdminLevel>;
    hidden_fields: string[];
    creatable_tiers: Tier[];
  };
  members: Member[];
  supers: Array<{ user_id: string; email: string | null; name: string | null }>;
}

type EditorState =
  | { mode: "create"; initial: EditorValue }
  | { mode: "edit"; id: string; initial: EditorValue }
  | null;

const labelOf = (key: string) => ADMIN_MODULES.find((m) => m.key === key)?.label ?? key;
const fieldLabel = (key: string) => FIELD_GROUPS.find((f) => f.key === key)?.label ?? key;

export default function TeamPage() {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [editor, setEditor] = useState<EditorState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; credentials: Credentials } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<TeamResponse>("/api/admin/team", { cache: "no-store" });
    if (res.ok && res.data) {
      setData(res.data);
      setError(undefined);
    } else {
      setError(res.error ?? "Could not load the team.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actor: AdminAccess | null = data
    ? { tier: data.me.tier, permissions: data.me.permissions, hiddenFields: data.me.hidden_fields }
    : null;
  const creatable = data?.me.creatable_tiers ?? [];

  function openCreate(tier: Tier) {
    setEditor({
      mode: "create",
      initial: {
        name: "",
        email: "",
        tier,
        permissions: {},
        // Start from the caller's own hidden fields: they can't be revealed anyway.
        hiddenFields: [...(data?.me.hidden_fields ?? [])],
        delivery: "invite",
      },
    });
  }

  function openEdit(m: Member) {
    setEditor({
      mode: "edit",
      id: m.user_id,
      initial: {
        name: m.name ?? "",
        email: m.email ?? "",
        tier: m.tier,
        permissions: m.permissions,
        hiddenFields: m.hidden_fields,
        delivery: "invite",
      },
    });
  }

  async function submit(v: EditorValue): Promise<{ error?: string; credentials?: Credentials }> {
    if (!editor) return {};
    const payload = { tier: v.tier, permissions: v.permissions, hidden_fields: v.hiddenFields };
    const res =
      editor.mode === "create"
        ? await apiFetch<{ credentials: Credentials }>("/api/admin/team", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, email: v.email.trim(), name: v.name.trim(), delivery: v.delivery }),
          })
        : await apiFetch("/api/admin/team/" + editor.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", ...payload, name: v.name.trim() }),
          });
    if (!res.ok) return { error: res.error ?? "Could not save." };
    invalidateAdminAccess();
    await load();
    if (editor.mode === "create") return { credentials: (res.data as { credentials: Credentials }).credentials };
    setNotice(`Saved ${v.name.trim()}'s access.`);
    return {};
  }

  async function act(m: Member, body: Record<string, unknown>) {
    setBusy(m.user_id);
    setNotice(null);
    const res = await apiFetch<{ warning?: string; credentials?: Credentials }>("/api/admin/team/" + m.user_id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      setNotice(res.error ?? "Could not update this member.");
      return;
    }
    if (res.data?.credentials) setIssued({ email: m.email ?? "", credentials: res.data.credentials });
    if (res.data?.warning) setNotice(res.data.warning);
    await load();
  }

  const subtitle =
    data?.me.tier === "super"
      ? "Add admins and staff, and decide exactly what each one can see and do."
      : "Add staff and give them any part of your own access.";

  return (
    <AdminPage
      eyebrow="Console access"
      title="Team & roles"
      subtitle={subtitle}
      icon={<UsersRound className="size-5" />}
      error={error}
      actions={
        <div className="flex flex-wrap gap-2">
          {creatable.includes("admin") && (
            <Button variant="brand" onClick={() => openCreate("admin")}>
              <Plus /> Add admin
            </Button>
          )}
          {creatable.includes("staff") && (
            <Button variant={creatable.includes("admin") ? "surface" : "brand"} onClick={() => openCreate("staff")}>
              <Plus /> Add staff
            </Button>
          )}
        </div>
      }
    >
      {notice && (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm font-semibold text-content-soft">{notice}</p>
      )}

      <HierarchyNote tier={data?.me.tier ?? null} />

      {data && data.me.tier !== "super" && <YourAccess me={data.me} />}

      <SectionCard eyebrow="Members" title={data?.me.tier === "super" ? "Admins & staff" : "Staff you added"}>
        {loading && !data ? (
          <p className="px-1 py-6 text-sm text-content-muted">Loading the team…</p>
        ) : !data || data.members.length === 0 ? (
          <EmptyState
            title="No team members yet"
            description={creatable.length ? "Add someone to give them their own sign-in and only the sections they need." : "Nobody has been added yet."}
          />
        ) : (
          <ul className="-mx-5 divide-y divide-hairline sm:-mx-6">
            {data.members.map((m) => (
              <MemberRow
                key={m.user_id}
                m={m}
                busy={busy === m.user_id}
                onEdit={() => openEdit(m)}
                onToggle={() => act(m, { action: m.disabled ? "enable" : "disable" })}
                onReset={() => act(m, { action: "reset_access", delivery: "invite" })}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {data && data.me.tier === "super" && data.supers.length > 0 && (
        <SectionCard eyebrow="Developer" title="Super admins">
          <ul className="-mx-5 divide-y divide-hairline sm:-mx-6">
            {data.supers.map((s) => (
              <li key={s.user_id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Terminal className="size-4 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-content">{s.name ?? "Super admin"}</p>
                  <p className="truncate text-xs text-content-muted">{s.email}</p>
                </div>
                <Badge variant="brand" className="ml-auto">Everything</Badge>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-xs text-content-muted">
            Super admins are added only with <code className="rounded bg-surface-muted px-1 py-0.5 font-mono">scripts/create-admin.mjs --super</code>, never from the console.
          </p>
        </SectionCard>
      )}

      {editor && actor && (
        <TeamMemberEditor
          mode={editor.mode}
          actor={actor}
          creatableTiers={creatable}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSubmit={submit}
        />
      )}

      {issued && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label="New sign-in link" className="w-full overflow-hidden rounded-t-3xl border border-hairline bg-surface-card shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="border-b border-hairline px-5 py-4">
              <h2 className="text-base font-bold text-content">New sign-in link</h2>
              <p className="text-xs text-content-muted">{issued.email}</p>
            </div>
            <CredentialsPanel credentials={issued.credentials} email={issued.email} onDone={() => setIssued(null)} />
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function HierarchyNote({ tier }: { tier: AdminAccess["tier"] | null }) {
  const steps = [
    { label: "Super admin", body: "Everything, including developer tools. Adds admins and staff.", icon: <Terminal className="size-4" />, me: tier === "super" },
    { label: "Admin", body: "Only the sections given. With Team access, adds staff — never admins.", icon: <ShieldCheck className="size-4" />, me: tier === "admin" },
    { label: "Staff", body: "Only the sections given. Can't add anyone.", icon: <UserCog className="size-4" />, me: tier === "staff" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 ${s.me ? "border-brand bg-brand-soft" : "border-hairline bg-surface-card"}`}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-content">
            <span className="text-brand">{s.icon}</span>
            {i + 1}. {s.label}
            {s.me && <Badge variant="brand" size="sm" className="ml-auto">You</Badge>}
          </span>
          <span className="text-xs text-content-soft">{s.body}</span>
        </li>
      ))}
    </ol>
  );
}

function YourAccess({ me }: { me: TeamResponse["me"] }) {
  const entries = Object.entries(me.permissions);
  return (
    <SectionCard eyebrow="Your access" title="What you can grant">
      <p className="pb-3 text-xs text-content-muted">
        Staff you add can have any of these, at up to the same level — and never a field hidden from you.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, level]) => (
          <Badge key={k} variant={level === "manage" ? "brand" : "neutral"}>
            {labelOf(k)} · {level}
          </Badge>
        ))}
      </div>
      {me.hidden_fields.length > 0 && (
        <p className="pt-3 text-xs text-content-muted">
          Hidden from you: {me.hidden_fields.map(fieldLabel).join(", ")}.
        </p>
      )}
    </SectionCard>
  );
}

function MemberRow({
  m,
  busy,
  onEdit,
  onToggle,
  onReset,
}: {
  m: Member;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onReset: () => void;
}) {
  const sections = Object.entries(m.permissions);
  const manage = sections.filter(([, l]) => l === "manage").length;
  return (
    <li className={`flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center ${m.disabled ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-content">{m.name ?? "Unnamed"}</p>
          <Badge variant={m.tier === "admin" ? "brand" : "info"} size="sm">{m.tier === "admin" ? "Admin" : "Staff"}</Badge>
          {m.disabled && <Badge variant="danger" size="sm">Disabled</Badge>}
        </div>
        <p className="truncate text-xs text-content-muted">
          {m.email} · added {dateOnly(m.created_at)}
          {m.created_by_name ? ` by ${m.created_by_name}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" size="sm">
            {sections.length} section{sections.length === 1 ? "" : "s"}
            {sections.length ? ` · ${manage} manage` : ""}
          </Badge>
          {sections.slice(0, 5).map(([k, level]) => (
            <Badge key={k} variant="neutral" size="sm">
              {labelOf(k)}{level === "view" ? " (view)" : ""}
            </Badge>
          ))}
          {sections.length > 5 && <Badge variant="neutral" size="sm">+{sections.length - 5} more</Badge>}
          {m.hidden_fields.length > 0 && (
            <Badge variant="warning" size="sm">Hidden: {m.hidden_fields.map(fieldLabel).join(", ")}</Badge>
          )}
        </div>
      </div>
      {m.manageable && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="surface" size="sm" onClick={onEdit} disabled={busy}>Edit access</Button>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={busy || m.disabled}>
            <Link2 /> New sign-in link
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} disabled={busy}>
            {m.disabled ? "Enable" : "Disable"}
          </Button>
        </div>
      )}
    </li>
  );
}
