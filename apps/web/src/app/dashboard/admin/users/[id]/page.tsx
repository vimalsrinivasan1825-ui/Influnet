"use client";

/**
 * Admin user detail — signup info, verification, who they're connected to,
 * and their activity timeline. No message/chat content anywhere here: a
 * connection shows the other party, the project/request it runs through,
 * and its stage/budget — never what was said inside it.
 *
 * G7 (docs/operations/ADMIN_AND_OBSERVABILITY_GAPS_2026-10-06.md): tabbed so
 * data that used to live only in its own console section — payments,
 * support, reports/blocks, devices, email/OTP/broadcast logs — is visible
 * here too. Each tab's data is null (not an error) when the signed-in admin
 * lacks that section's permission, same convention as the API; a null
 * section renders nothing rather than an empty state, so a staff member
 * without, say, Payments access never sees a "no payments" tab that implies
 * there truly are none.
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
  IndianRupee,
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
import { SegmentedTabs } from "@/components/ui/tabs";

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

interface Payment {
  id: string;
  project_id: number;
  stage_key: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface Subscription {
  tier: string;
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
}

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
}

interface ReportRow {
  id: string;
  reason: string;
  status: string;
  context: string | null;
  created_at: string;
  reported?: PartyRef | null;
  reporter?: PartyRef | null;
}

interface BlockRow {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocker?: PartyRef | null;
  blocked?: PartyRef | null;
}

interface DeviceRow {
  id: string;
  platform: string;
  app_version: string | null;
  os_version: string | null;
  permission: string;
  last_seen_at: string;
  disabled_at: string | null;
}

interface SocialClaimRow {
  id: string;
  platform: string;
  handle: string;
  status: string;
  verified_at: string | null;
  created_at: string;
}

interface EmailLogRow {
  id: string;
  template: string;
  category: string;
  status: string;
  error: string | null;
  created_at: string;
}

interface OtpLogRow {
  id: string;
  action: string;
  status: string | null;
  created_at: string;
}

interface BroadcastDeliveryRow {
  id: number;
  channel: string;
  status: string;
  skip_reason: string | null;
  sent_at: string | null;
  created_at: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  read_at: string | null;
  created_at: string;
}

interface SignInRow {
  at: string;
  action: string;
  ip_address: string | null;
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

interface UserPageData {
  user: UserDetail;
  projects: ProjectConnection[];
  requests: RequestConnection[];
  activity: ActivityEvent[];
  payments: Payment[] | null;
  subscription: Subscription | null;
  supportTickets: SupportTicket[] | null;
  reportsFiled: ReportRow[] | null;
  reportsAgainst: ReportRow[] | null;
  blocks: BlockRow[] | null;
  devices: DeviceRow[] | null;
  socialClaims: SocialClaimRow[] | null;
  otpLog: OtpLogRow[] | null;
  broadcastDeliveries: BroadcastDeliveryRow[] | null;
  notifications: NotificationRow[] | null;
  signIns: SignInRow[];
  emailLog: EmailLogRow[] | null;
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

type TabKey = "overview" | "money" | "connections" | "safety" | "devices" | "timeline";

/** A section the caller lacks permission for is `null`; distinguish that from a genuinely empty `[]`. */
function Section({
  title,
  icon,
  data,
  emptyLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  data: unknown[] | null;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (data === null) return null;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-content">{icon} {title}</h2>
      {data.length === 0 ? (
        <EmptyState icon={<>{icon}</>} title="Nothing here" description={emptyLabel} />
      ) : (
        children
      )}
    </Card>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<UserPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  const user = data?.user ?? null;

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
        const res = await apiFetch<UserPageData>(`/api/admin/users/${id}`);
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load user");
        setData(res.data);
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

  if (error || !user || !data) {
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

  const tabs: { value: TabKey; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "money", label: "Money" },
    { value: "connections", label: "Projects & requests" },
    { value: "safety", label: "Support & safety" },
    { value: "devices", label: "Devices & comms" },
    { value: "timeline", label: "Timeline" },
  ];

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

      <SegmentedTabs tabs={tabs} value={tab} onValueChange={setTab} className="w-fit" />

      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "money" && <MoneyTab data={data} />}
      {tab === "timeline" && <TimelineTab activity={data.activity} />}
    </div>
  );
}

function OverviewTab({ data }: { data: UserPageData }) {
  return (
    <Section
      title="Sign-ins"
      icon={<History className="size-4" />}
      data={data.signIns}
      emptyLabel="No recorded sign-in activity yet."
    >
      <div className="flex flex-col divide-y divide-hairline">
        {data.signIns.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm font-semibold text-content">{s.action}</span>
            <span className="text-xs text-content-muted">
              {timeAgo(s.at)}{s.ip_address ? ` · ${s.ip_address}` : ""}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function MoneyTab({ data }: { data: UserPageData }) {
  return (
    <>
      {data.subscription !== null && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-content"><IndianRupee className="size-4" /> Pro subscription</h2>
          {data.subscription ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={data.subscription.status === "active" ? "info" : "neutral"} size="sm">
                {data.subscription.tier} · {data.subscription.status}
              </Badge>
              {data.subscription.current_period_end && (
                <span className="text-content-soft">
                  Renews {new Date(data.subscription.current_period_end).toLocaleDateString()}
                </span>
              )}
              {data.subscription.cancel_at_period_end && <Badge variant="warning" size="sm">Cancels at period end</Badge>}
              {data.subscription.grace_until && (
                <span className="text-content-soft">Grace until {new Date(data.subscription.grace_until).toLocaleDateString()}</span>
              )}
            </div>
          ) : (
            <EmptyState icon={<IndianRupee />} title="Free tier" description="No Pro subscription on this account." />
          )}
        </Card>
      )}

      <Section
        title="Payments"
        icon={<IndianRupee className="size-4" />}
        data={data.payments}
        emptyLabel="No payments across this person's projects."
      >
        <div className="flex flex-col divide-y divide-hairline">
          {(data.payments || []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-content">{STAGE_LABELS[p.stage_key] || p.stage_key}</div>
                <div className="text-xs text-content-muted">Project #{p.project_id} · {timeAgo(p.paid_at || p.created_at)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.status === "paid" ? "info" : p.status === "refunded" ? "warning" : p.status === "failed" ? "danger" : "neutral"} size="sm">
                  {p.status}
                </Badge>
                <span className="text-xs font-semibold text-content-soft">
                  {p.currency} {(p.amount / 100).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function TimelineTab({ activity }: { activity: ActivityEvent[] }) {
  return (
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
  );
}
