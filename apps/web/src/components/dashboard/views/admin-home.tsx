"use client";

import {
  BadgeCheck,
  Building2,
  Clock,
  FolderKanban,
  Send,
  Shield,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { Reveal, Stagger } from "@/components/ui/motion";
import { DonutChart } from "@/components/ui/chart";
import type { AdminHomeData } from "./types";

function Row({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-muted px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-semibold text-content-soft">{label}</span>
      </div>
      <span className="text-base font-extrabold text-content tabular-nums">{value}</span>
    </div>
  );
}

export function AdminHomeView({ data: s }: { data: AdminHomeData }) {
  const audience = [
    { name: "Businesses", value: s.total_businesses, fill: "#6366f1" },
    { name: "Influencers", value: s.total_influencers, fill: "#f26e59" },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      {/* Header */}
      <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_6px_16px_-6px_var(--brand-ring)]">
            <Shield className="size-5" />
          </span>
          <div>
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
              Platform admin
            </p>
            <h1 className="text-xl font-extrabold tracking-tight text-content sm:text-2xl">
              Control center
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/dashboard/admin/approvals" variant="brand" size="xl">
            <BadgeCheck /> Approvals
            {s.pending_approvals > 0 && (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[0.6875rem] font-bold">
                {s.pending_approvals}
              </span>
            )}
          </ButtonLink>
          <ButtonLink href="/dashboard/admin/users" variant="surface" size="xl">
            <Users /> All users
          </ButtonLink>
        </div>
      </Reveal>

      {/* KPIs */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" start={0.05}>
        <StatCard label="Total users" value={s.total_users} tone="info" icon={<Users />} hint="On the platform" />
        <StatCard label="Businesses" value={s.total_businesses} tone="brand" icon={<Building2 />} hint="Registered brands" />
        <StatCard label="Influencers" value={s.total_influencers} tone="warning" icon={<Star />} hint="Verified creators" />
        <StatCard
          label="Pending approvals"
          value={s.pending_approvals}
          tone={s.pending_approvals > 0 ? "warning" : "success"}
          icon={<Clock />}
          hint={s.pending_approvals > 0 ? "Need review" : "All clear"}
        />
      </Stagger>

      {/* Breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.1}>
          <SectionCard eyebrow="Audience" title="User mix" className="h-full">
            <DonutChart data={audience} height={200} centerLabel="Users" centerValue={s.total_users} />
          </SectionCard>
        </Reveal>

        <Reveal delay={0.15}>
          <SectionCard
            eyebrow="Collaborations"
            title="Requests"
            className="h-full"
            action={
              <ButtonLink href="/dashboard/admin/collabs" variant="link" size="sm">
                View
              </ButtonLink>
            }
          >
            <div className="flex flex-col gap-2.5">
              <Row color="#6366f1" label="Total requests" value={s.total_collabs} />
              <Row color="#16a34a" label="Active" value={s.active_collabs} />
              <Row color="#d97706" label="Pending response" value={s.pending_collabs} />
            </div>
          </SectionCard>
        </Reveal>

        <Reveal delay={0.2}>
          <SectionCard
            eyebrow="Campaigns"
            title="Projects"
            className="h-full"
            action={
              <ButtonLink href="/dashboard/admin/projects" variant="link" size="sm">
                View
              </ButtonLink>
            }
          >
            <div className="flex flex-col gap-2.5">
              <Row color="#2563eb" label="Active projects" value={s.active_projects} />
              <Row color="#16a34a" label="Completed" value={s.completed_projects} />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-hairline bg-surface-muted px-4 py-3">
              <FolderKanban className="size-4 text-content-muted" />
              <span className="text-xs text-content-soft">
                Manage every campaign from the projects console.
              </span>
            </div>
          </SectionCard>
        </Reveal>
      </div>

      <Reveal delay={0.24}>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-5 py-4 shadow-[var(--shadow-card)]">
          <Badge variant="brand" size="md">
            <Send /> Quick actions
          </Badge>
          <ButtonLink href="/dashboard/admin/approvals" variant="ghost" size="sm">
            Review approvals
          </ButtonLink>
          <ButtonLink href="/dashboard/admin/users" variant="ghost" size="sm">
            Manage users
          </ButtonLink>
          <ButtonLink href="/dashboard/admin/collabs" variant="ghost" size="sm">
            Inspect requests
          </ButtonLink>
        </div>
      </Reveal>
    </div>
  );
}
