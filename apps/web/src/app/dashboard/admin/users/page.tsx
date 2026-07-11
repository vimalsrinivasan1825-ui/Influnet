"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Search, Users } from "lucide-react";
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
  company_name?: string;
  business_industry?: string;
  approval_status?: string;
  username?: string;
  niche?: string[];
}

const roleMeta = (role: string) => {
  if (role === "business_owner") return { label: "Business", variant: "brand" as const };
  if (role === "influencer") return { label: "Creator", variant: "info" as const };
  return { label: "Admin", variant: "neutral" as const };
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ users: PlatformUser[] }>("/api/admin/users");
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to fetch users");
        setUsers(res.data.users || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        subtitle={`${users.length} total platform users`}
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
              </tr>
            </THead>
            <TBody>
              {filtered.map((u) => {
                const rm = roleMeta(u.role);
                const pending =
                  u.role === "business_owner" && u.approval_status === "pending_review";
                return (
                  <TRow key={u.id}>
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
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
