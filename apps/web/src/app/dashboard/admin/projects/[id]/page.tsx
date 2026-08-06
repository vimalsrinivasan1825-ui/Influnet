"use client";

/**
 * Admin project detail — read-only view of the stage pipeline: participants,
 * budget, current stage, the stage checklist, activity feed and payment
 * ledger. No participant actions here (no messaging, no stage advancement,
 * no toggling checklist items) — this is oversight, not a way to run the
 * project. Stage keys/labels mirror STAGE_CONFIG in
 * dashboard/projects/[id]/page.tsx.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Award,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Eye,
  FileText,
  History,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Scissors,
  ThumbsUp,
  Wallet,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { styleForStatus } from "@/lib/project-status";
import { cn } from "@/lib/utils";

interface PartyRef {
  id: string;
  name: string | null;
  email?: string | null;
  role: string;
}

interface ProjectDetail {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  current_stage: string;
  budget: number | string | null;
  timeline?: string | null;
  created_at: string;
  owner: PartyRef | null;
  counterparty: PartyRef | null;
}

interface StageItem {
  id: string;
  stage_key: string;
  label: string;
  owner_role: string;
  is_required: boolean;
  is_gate: boolean;
  done_at: string | null;
  done_by: string | null;
}

interface ActivityRow {
  id: string;
  actor_user_id: string | null;
  type: string;
  summary: string;
  created_at: string;
}

interface PaymentRow {
  id: string;
  stage_key: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

const STAGE_CONFIG: { key: string; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { key: "collaboration_started", label: "Started", icon: Zap, color: "#3b82f6" },
  { key: "project_discussion", label: "Discussion", icon: MessageSquare, color: "#6366f1" },
  { key: "advance_payment", label: "Deposit", icon: Wallet, color: "#10b981" },
  { key: "content_planning", label: "Planning", icon: FileText, color: "#f59e0b" },
  { key: "content_confirmation", label: "Approved", icon: CheckCircle2, color: "#06b6d4" },
  { key: "shooting_in_progress", label: "Shooting", icon: Camera, color: "#a855f7" },
  { key: "editing_in_progress", label: "Editing", icon: Scissors, color: "#ec4899" },
  { key: "sent_for_review", label: "Review", icon: Eye, color: "#eab308" },
  { key: "revisions", label: "Revisions", icon: RefreshCw, color: "#f43f5e" },
  { key: "final_approval", label: "Final OK", icon: ThumbsUp, color: "#14b8a6" },
  { key: "final_payment", label: "Payment", icon: CreditCard, color: "#10b981" },
  { key: "project_completed", label: "Completed", icon: Award, color: "#16a34a" },
];

export default function AdminProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [stageItems, setStageItems] = useState<StageItem[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{
          project: ProjectDetail;
          stageItems: StageItem[];
          activity: ActivityRow[];
          payments: PaymentRow[];
        }>(`/api/admin/projects/${id}`);
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load project");
        setProject(res.data.project);
        setStageItems(res.data.stageItems || []);
        setActivity(res.data.activity || []);
        setPayments(res.data.payments || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project");
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

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error || "Project not found"}
        </div>
      </div>
    );
  }

  const currentIndex = STAGE_CONFIG.findIndex((s) => s.key === project.current_stage);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/dashboard/admin/projects"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-content-soft hover:text-content"
      >
        <ArrowLeft className="size-4" /> All projects
      </Link>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={project.title} size="lg" square />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold text-content">{project.title}</span>
                <Badge variant={styleForStatus(project.status).variant} size="sm">
                  {project.status === "active" ? "Active" : styleForStatus(project.status).label}
                </Badge>
              </div>
              {project.description && (
                <p className="mt-1 max-w-lg truncate text-sm text-content-soft">{project.description}</p>
              )}
            </div>
          </div>
          {project.budget != null && project.budget !== "" && (
            <div className="text-right">
              <div className="text-xs text-content-muted">Budget</div>
              <div className="text-lg font-bold text-content">₹{Number(project.budget).toLocaleString()}</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4 text-sm">
          {project.owner && (
            <Link href={`/dashboard/admin/users/${project.owner.id}`} className="flex items-center gap-2 hover:underline">
              <Avatar name={project.owner.name} size="xs" square />
              <span className="font-semibold text-content">{project.owner.name || "Unknown"}</span>
              <span className="text-content-muted">(Brand)</span>
            </Link>
          )}
          <ArrowLeftRight className="size-3.5 text-content-muted" />
          {project.counterparty && (
            <Link href={`/dashboard/admin/users/${project.counterparty.id}`} className="flex items-center gap-2 hover:underline">
              <Avatar name={project.counterparty.name} size="xs" square />
              <span className="font-semibold text-content">{project.counterparty.name || "Unknown"}</span>
              <span className="text-content-muted">(Creator)</span>
            </Link>
          )}
          <span className="ml-auto text-xs text-content-muted">
            Started {new Date(project.created_at).toLocaleDateString()}
          </span>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-sm font-bold text-content">Stage</h2>
        <div className="flex flex-wrap items-center gap-2">
          {STAGE_CONFIG.map((s, i) => {
            const Icon = s.icon;
            const done = currentIndex >= 0 && i < currentIndex;
            const active = i === currentIndex;
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  active
                    ? "border-transparent text-white"
                    : done
                      ? "border-hairline bg-surface-muted text-content-soft"
                      : "border-dashed border-hairline text-content-muted",
                )}
                style={active ? { backgroundColor: s.color } : undefined}
              >
                <Icon className="size-3" /> {s.label}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content"><ListChecks className="size-4" /> Checklist</h2>
        {stageItems.length === 0 ? (
          <EmptyState icon={<ListChecks />} title="No checklist items" description="Nothing tracked for this project yet." />
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {stageItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className={cn("size-4 shrink-0", it.done_at ? "text-ok" : "text-content-muted")} />
                  <span className={cn("truncate text-sm", it.done_at ? "text-content-soft line-through" : "text-content")}>
                    {it.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="neutral" size="sm">{it.stage_key}</Badge>
                  {it.is_gate && <Badge variant="warning" size="sm">Gate</Badge>}
                  {it.is_required && !it.done_at && <Badge variant="danger" size="sm">Required</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content"><CircleDollarSign className="size-4" /> Payments</h2>
        {payments.length === 0 ? (
          <EmptyState icon={<CircleDollarSign />} title="No payments" description="No payments have been recorded for this project." />
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="text-sm text-content">
                  ₹{p.amount.toLocaleString()} <span className="text-content-muted">· {p.stage_key || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "paid" ? "info" : p.status === "failed" ? "danger" : "neutral"} size="sm">
                    {p.status}
                  </Badge>
                  <span className="text-xs text-content-muted">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content"><History className="size-4" /> Activity</h2>
        {activity.length === 0 ? (
          <EmptyState icon={<History />} title="Nothing recorded" description="No activity logged for this project yet." />
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm text-content">{a.summary}</span>
                <span className="shrink-0 text-xs text-content-muted">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
