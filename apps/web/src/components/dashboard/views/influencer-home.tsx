"use client";

import {
  BadgeCheck,
  DollarSign,
  FolderGit2,
  MapPin,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, Stagger } from "@/components/ui/motion";
import { AreaChart, DonutChart, type ChartConfig } from "@/components/ui/chart";
import type { InfluencerHomeData } from "./types";
import { WelcomeModal } from "./welcome-modal";

const earningsConfig: ChartConfig = {
  amount: { label: "Pipeline", color: "var(--brand)" },
};

export function InfluencerHomeView({ data }: { data: InfluencerHomeData }) {
  const p = data.profile;
  const s = data.stats;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <WelcomeModal username={p.username} />
      {/* Header */}
      <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={p.name} src={p.avatar_url} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-content sm:text-2xl">
                {p.name}
              </h1>
              {p.is_verified && (
                <Badge variant="success" size="sm">
                  <BadgeCheck /> Verified
                </Badge>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-sm text-content-soft">
              <span>@{p.username}</span>
              {p.location && (
                <>
                  <span className="text-content-muted">·</span>
                  <MapPin className="size-3.5 text-content-muted" />
                  <span>{p.location}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/dashboard/settings" variant="surface" size="xl">
            Edit profile
          </ButtonLink>
          <ButtonLink href="/dashboard/requests" variant="brand" size="xl">
            <Send /> View pitches
          </ButtonLink>
        </div>
      </Reveal>

      {/* KPIs */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" start={0.05}>
        <StatCard
          label="Pipeline value"
          value={`₹${s.pipeline_value.toLocaleString()}`}
          hint="From accepted requests"
          tone="success"
          icon={<DollarSign />}
        />
        <StatCard
          label="Active projects"
          value={s.active_projects}
          hint="In production"
          tone="info"
          icon={<FolderGit2 />}
        />
        <StatCard
          label="Open chats"
          value={s.active_discussions}
          hint="Ongoing conversations"
          tone="brand"
          icon={<MessageSquare />}
        />
        <StatCard
          label="New pitches"
          value={s.collab_requests}
          hint="Awaiting your reply"
          tone="warning"
          icon={<Send />}
        />
      </Stagger>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.1} className="lg:col-span-2">
          <SectionCard eyebrow="Pipeline" title="Weekly pipeline trend" className="h-full">
            <AreaChart
              data={data.earnings_trend}
              config={earningsConfig}
              xKey="week"
              areas={[{ dataKey: "amount" }]}
              height={220}
              prefix="₹"
            />
          </SectionCard>
        </Reveal>
        <Reveal delay={0.15}>
          <SectionCard eyebrow="Requests" title="Collaboration breakdown" className="h-full">
            {data.request_breakdown.some((d) => d.value > 0) ? (
              <DonutChart
                data={data.request_breakdown}
                height={220}
                centerLabel="Requests"
              />
            ) : (
              <EmptyState
                icon={<Sparkles />}
                title="No requests yet"
                description="Your incoming collaboration requests will break down here."
              />
            )}
          </SectionCard>
        </Reveal>
      </div>

      {/* Profile + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.18}>
          <SectionCard eyebrow="Profile" title="Snapshot" className="h-full">
            {p.headline && (
              <p className="text-sm leading-relaxed text-content-soft">{p.headline}</p>
            )}
            {p.niche.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.niche.map((n) => (
                  <Badge key={n} variant="brand" size="sm">
                    {n}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-hairline bg-surface-muted px-4 py-3">
              <span className="text-sm font-semibold text-content-soft">Pipeline value</span>
              <span className="text-lg font-extrabold text-ok">
                ₹{s.pipeline_value.toLocaleString()}
              </span>
            </div>
          </SectionCard>
        </Reveal>

        <Reveal delay={0.22} className="lg:col-span-2">
          <SectionCard
            eyebrow="Activity"
            title="Recent brand collabs"
            className="h-full"
            action={
              <ButtonLink href="/dashboard/projects" variant="link" size="sm">
                View all
              </ButtonLink>
            }
          >
            {!data.recent_collabs || data.recent_collabs.length === 0 ? (
              <EmptyState
                icon={<FolderGit2 />}
                title="No collaborations yet"
                description="Complete your profile to get discovered by brands."
                action={
                  <ButtonLink href="/dashboard/settings" variant="brandSoft" size="sm">
                    Complete profile
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recent_collabs.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-muted px-3.5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.name} size="sm" square />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-content">{c.name}</p>
                        <p className="text-xs text-content-muted">Brand partner</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-bold text-content">{c.amount}</span>
                      <Badge variant={statusVariant(c.status)} size="sm" dot>
                        {c.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </Reveal>
      </div>
    </div>
  );
}
