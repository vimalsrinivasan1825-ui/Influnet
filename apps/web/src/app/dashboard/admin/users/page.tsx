"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, TRow } from "@/components/ui/table";

interface PlatformUser {
  id: string;
  role: string;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  created_at: string;
  /** From auth.users. null when the account has never signed in. */
  last_sign_in_at: string | null;
  company_name?: string;
  business_industry?: string;
  approval_status?: string;
  username?: string;
  niche?: string[];
  /** True for an auth user with no profiles row — a stalled signup. */
  orphaned?: boolean;
  email_confirmed?: boolean;
}

/**
 * Same shape as the one in components/dashboard/blocked-accounts-panel.tsx.
 * "3h ago" is what you want when scanning a tester round; an absolute date
 * only helps once it's old enough to stop mattering.
 */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const roleMeta = (role: string) => {
  if (role === "business_owner") return { label: "Business", variant: "brand" as const };
  if (role === "influencer") return { label: "Creator", variant: "info" as const };
  return { label: "Admin", variant: "neutral" as const };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [orphans, setOrphans] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch<{ users: PlatformUser[]; orphans?: PlatformUser[] }>("/api/admin/users");
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to fetch users");
      setUsers(res.data.users || []);
      setOrphans(res.data.orphans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function deleteUser(u: PlatformUser) {
    const label = u.email || u.name || u.id;
    if (
      !window.confirm(
        `Permanently delete ${label}?\n\nThis removes the account and everything it owns — projects, requests, messages, portfolio. Documents they issued are kept but un-linked. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(u.id);
    const res = await apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      toast.error(res.error || "Could not delete this user.");
      return;
    }
    toast.success(`Deleted ${label}`);
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    setOrphans((prev) => prev.filter((x) => x.id !== u.id));
  }

  const filtered = users.filter(
    (u) =>
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.company_name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="User management"
        title="All users"
        subtitle={`${users.length} platform users${orphans.length ? ` · ${orphans.length} incomplete signup${orphans.length === 1 ? "" : "s"}` : ""}`}
        icon={<Users />}
        actions={
          <InputGroup icon={<Search />} className="w-full sm:w-64">
            <Input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search />}
            title="No users found"
            description="No users match your search."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th className="hidden md:table-cell">Location</th>
                <th className="hidden sm:table-cell">Joined</th>
                <th>Last seen</th>
                <th className="w-10" />
              </tr>
            </THead>
            <TBody>
              {filtered.map((u) => {
                const rm = roleMeta(u.role);
                const pending =
                  u.role === "business_owner" && u.approval_status === "pending_review";
                return (
                  <TRow
                    key={u.id}
                    interactive
                    onClick={() => router.push(`/dashboard/admin/users/${u.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" square />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-content">
                              {u.name || "Unnamed"}
                            </span>
                            <Badge variant={rm.variant} size="sm">
                              {rm.label}
                            </Badge>
                            {pending && (
                              <Badge variant="warning" size="sm">
                                Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-content">{u.email}</div>
                      <div className="text-xs text-content-muted">
                        {u.company_name
                          ? u.company_name
                          : u.username
                            ? `@${u.username}`
                            : "—"}
                      </div>
                    </td>
                    <td className="hidden text-sm text-content-soft md:table-cell">
                      {u.location || "—"}
                    </td>
                    <td className="hidden text-sm text-content-soft sm:table-cell">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-sm">
                      {u.last_sign_in_at ? (
                        <span
                          className="text-content-soft"
                          title={new Date(u.last_sign_in_at).toLocaleString()}
                        >
                          {timeAgo(u.last_sign_in_at)}
                        </span>
                      ) : (
                        // Signed up but never came back — the one row on this
                        // page worth chasing during a tester round.
                        <span className="text-content-muted">Never</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Delete ${u.name || u.email}`}
                        disabled={deleting === u.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteUser(u);
                        }}
                        className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                      >
                        {deleting === u.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </td>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Stalled signups — an auth user with no profile. Almost always safe to
          delete; nothing depends on them. */}
      {!loading && orphans.length > 0 && (
        <Card className="overflow-hidden border-warn/30">
          <div className="flex items-center gap-2 border-b border-hairline bg-warn-soft px-5 py-3 text-sm font-bold text-warn">
            <AlertTriangle className="size-4" />
            Incomplete signups ({orphans.length})
            <span className="font-medium text-content-muted">
              — auth account created, profile never finished
            </span>
          </div>
          <Table>
            <THead>
              <tr>
                <th>Email</th>
                <th className="hidden sm:table-cell">Intended role</th>
                <th className="hidden md:table-cell">Created</th>
                <th>Email confirmed</th>
                <th className="w-10" />
              </tr>
            </THead>
            <TBody>
              {orphans.map((u) => (
                <TRow key={u.id}>
                  <td>
                    <div className="text-sm font-semibold text-content">{u.email}</div>
                    {u.username && (
                      <div className="text-xs text-content-muted">wanted @{u.username}</div>
                    )}
                  </td>
                  <td className="hidden text-sm text-content-soft sm:table-cell">
                    {u.role === "unknown" ? "—" : roleMeta(u.role).label}
                  </td>
                  <td className="hidden text-sm text-content-soft md:table-cell">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="text-sm text-content-soft">
                    {u.email_confirmed ? "Yes" : "No"}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Delete ${u.email}`}
                      disabled={deleting === u.id}
                      onClick={() => void deleteUser(u)}
                      className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    >
                      {deleting === u.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </td>
                </TRow>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
