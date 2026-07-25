"use client";

import { useState } from "react";
import {
  BadgeCheck,
  DollarSign,
  FileClock,
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
import { MediaKitNudge } from "@/components/dashboard/media-kit-nudge";

const earningsConfig: ChartConfig = {
  amount: { label: "Earnings", color: "var(--brand)" },
};

export function InfluencerHomeView({ data }: { data: InfluencerHomeData }) {
  const p = data.profile;
  const s = data.stats;
  // The welcome card and the media-kit nudge both compete for a first-time
  // creator's attention. Hold the nudge back until the welcome card is out of
  // the way — first impressions shouldn't be two overlapping asks at once.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <WelcomeModal username={p.username} seen={p.welcome_seen} onOpenChange={setWelcomeOpen} />
      {!welcomeOpen && <MediaKitNudge />}
      {/* Header */}
      <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={p.name} src={p.avatar_url} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
                Welcome back, {p.name.split(' ')[0]}!
              </h1>
              {p.is_verified && (
                <Badge variant="success" size="sm" className="hidden sm:inline-flex">
                  <BadgeCheck className="size-3" />
                </Badge>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-sm text-content-soft">
              {p.username ? <span>@{p.username}</span> : <span>Choose a username in Settings</span>}
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
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-5" start={0.05}>
        {s.proposals_awaiting_you > 0 && (
          <StatCard
            label="Terms awaiting you"
            value={s.proposals_awaiting_you}
            hint="A brand proposed a project"
            tone="warning"
            icon={<FileClock />}
          />
        )}
        <StatCard
          label="Agreed & in progress"
          value={`₹${s.pipeline_value.toLocaleString()}`}
          hint="Budget of active projects"
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
          <SectionCard eyebrow="Earnings" title="Weekly earnings" className="h-full">
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
          <SectionCard eyebrow="Brands" title="Active Roster" className="h-full">
            {!data.active_roster || data.active_roster.length === 0 ? (
              <EmptyState
                icon={<FolderGit2 />}
                title="No active projects yet"
                description="Brands you're currently working with will show up here once a project is agreed."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {data.active_roster.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <Avatar name={r.brand_name} size="sm" square />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-content">{r.brand_name}</p>
                      <p className="truncate text-xs text-content-muted">{r.project_title}</p>
                    </div>
                    <Badge variant="success" size="sm" dot>Active</Badge>
                  </div>
                ))}
              </div>
            )}
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
