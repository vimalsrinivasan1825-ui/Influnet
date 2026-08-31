"use client";

/**
 * Admin user detail — signup info, verification, who they're connected to,
 * and their activity timeline. No message/chat content anywhere here: a
 * connection shows the other party, the project/request it runs through,
 * and its stage/budget — never what was said inside it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  History,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Trash2,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface PartyRef {
  id: string;
  name: string | null;
  role: string;
}

interface ProjectConnection {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  budget: number | string | null;
  created_at: string;
  owner: PartyRef | null;
  counterparty: PartyRef | null;
}

interface RequestConnection {
  id: string;
  status: string;
  budget: number | string | null;
  created_at: string;
  updated_at: string;
  from_user: PartyRef | null;
  to_user: PartyRef | null;
}

interface ActivityEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
}

interface UserDetail {
  id: string;
  role: string;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  verification_status?: string;
  verified_badge?: boolean;
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

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
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

const STAGE_LABELS: Record<string, string> = {
  collaboration_started: "Started",
  project_discussion: "Discussion",
  advance_payment: "Deposit",
  content_planning: "Planning",
  content_confirmation: "Approved",
  shooting_in_progress: "Shooting",
  editing_in_progress: "Editing",
  sent_for_review: "Review",
  revisions: "Revisions",
  final_approval: "Final OK",
  final_payment: "Payment",
  project_completed: "Completed",
};

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [projects, setProjects] = useState<ProjectConnection[]>([]);
  const [requests, setRequests] = useState<RequestConnection[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteUser() {
    if (!user) return;
    const label = user.email || user.name || id;
    if (
      !window.confirm(
        `Permanently delete ${label}?\n\nRemoves the account and everything it owns — projects, requests, messages, portfolio. Documents they issued are kept but un-linked. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error || "Could not delete this user.");
      return;
    }
    toast.success(`Deleted ${label}`);
    router.push("/dashboard/admin/users");
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{
          user: UserDetail;
          projects: ProjectConnection[];
          requests: RequestConnection[];
          activity: ActivityEvent[];
        }>(`/api/admin/users/${id}`);
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load user");
        setUser(res.data.user);
        setProjects(res.data.projects || []);
        setRequests(res.data.requests || []);
        setActivity(res.data.activity || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error || "User not found"}
        </div>
      </div>
    );
  }

  const rm = roleMeta(user.role);
  const pending = user.role === "business_owner" && user.approval_status === "pending_review";

  // The pair of tables merged and sorted newest-first — "who they're
  // connected to" regardless of whether it's a pending ask or a live deal.
  const connections = [
    ...projects.map((p) => {
      const other = p.owner?.id === id ? p.counterparty : p.owner;
      return {
        key: `project-${p.id}`,
        other,
        kind: "project" as const,
        label: p.title,
        status: p.status,
        stage: STAGE_LABELS[p.current_stage] || p.current_stage,
        budget: p.budget,
        at: p.created_at,
        href: `/dashboard/admin/projects/${p.id}`,
      };
    }),
    ...requests.map((r) => {
      const other = r.from_user?.id === id ? r.to_user : r.from_user;
      return {
        key: `request-${r.id}`,
        other,
        kind: "request" as const,
        label: r.from_user?.id === id ? "Sent a request" : "Received a request",
        status: r.status,
        stage: null,
        budget: r.budget,
        at: r.updated_at || r.created_at,
        href: other ? `/dashboard/admin/users/${other.id}` : undefined,
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/dashboard/admin/users"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-content-soft hover:text-content"
      >
        <ArrowLeft className="size-4" /> All users
      </Link>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" square />
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-lg font-bold text-content">{user.name || "Unnamed"}</span>
                <Badge variant={rm.variant} size="sm">{rm.label}</Badge>
                {user.verified_badge && (
                  <Badge variant="info" size="sm">
                    <BadgeCheck className="size-3" /> Verified
                  </Badge>
                )}
                {pending && <Badge variant="warning" size="sm">Pending approval</Badge>}
              </div>
              <div className="mt-0.5 text-sm text-content-soft">
                {user.company_name || (user.username ? `@${user.username}` : "—")}
              </div>
            </div>
          </div>
          {user.role !== "admin" && (
            <Button variant="destructive" size="sm" onClick={deleteUser} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete user
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-hairline pt-4 text-sm sm:grid-cols-4">
          <div className="flex items-center gap-1.5 text-content-soft"><Mail className="size-3.5" /> {user.email}</div>
          <div className="flex items-center gap-1.5 text-content-soft"><Phone className="size-3.5" /> {user.phone || "—"}</div>
          <div className="flex items-center gap-1.5 text-content-soft"><MapPin className="size-3.5" /> {user.location || "—"}</div>
          <div className="flex items-center gap-1.5 text-content-soft"><Calendar className="size-3.5" /> Joined {new Date(user.created_at).toLocaleDateString()}</div>
        </div>
        <div className="text-xs text-content-muted">
          Last seen: {timeAgo(user.last_sign_in_at)}
          {user.verification_status && ` · Verification: ${user.verification_status}`}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content"><Users className="size-4" /> Connected with</h2>
        {connections.length === 0 ? (
          <EmptyState icon={<Users />} title="No connections yet" description="No requests or projects involving this user." />
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {connections.map((c) => {
              const row = (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={c.other?.name || "Unknown"} size="sm" square />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-content">
                        {c.other?.name || "Unknown user"}
                      </div>
                      <div className="text-xs text-content-muted">{c.label}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.stage && <Badge variant="brand" size="sm">{c.stage}</Badge>}
                    <Badge variant={c.status === "accepted" || c.status === "active" ? "info" : c.status === "declined" || c.status === "cancelled" ? "neutral" : "warning"} size="sm">
                      {c.status}
                    </Badge>
                    {c.budget != null && c.budget !== "" && (
                      <span className="text-xs font-semibold text-content-soft">₹{Number(c.budget).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              );
              return c.href ? (
                <Link key={c.key} href={c.href} className="-mx-2 rounded-lg px-2 hover:bg-surface-muted">
                  {row}
                </Link>
              ) : (
                <div key={c.key}>{row}</div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content"><History className="size-4" /> Activity</h2>
        {activity.length === 0 ? (
          <EmptyState icon={<History />} title="Nothing recorded" description="This user hasn't done anything yet." />
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {activity.map((e, i) => {
              const row = (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-content">{e.title}</div>
                    {e.detail && <div className="truncate text-xs text-content-muted">{e.detail}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-content-muted">{timeAgo(e.at)}</span>
                </div>
              );
              return e.link ? (
                <Link key={i} href={e.link} className="-mx-2 rounded-lg px-2 hover:bg-surface-muted">
                  {row}
                </Link>
              ) : (
                <div key={i}>{row}</div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
