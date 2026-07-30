"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { toConnectionRows, type RawConversation, type RawConversationProject } from "@/lib/connections";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonLink } from "@/components/ui/button";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Was a static "No connections yet" stub regardless of real state. A
 * connection is anyone you have a conversation and/or an accepted project
 * with — the same source the Messages page reads (see lib/connections.ts,
 * which mirrors apps/mobile/lib/conversations.ts). Rather than duplicating
 * that data with a new API, this reuses /api/conversations and links each
 * row into Messages via the existing ?conv= deep link.
 */
export default function ConnectionsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<RawConversation[]>([]);
  const [projects, setProjects] = useState<RawConversationProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      setUserId(user?.id ?? null);

      const res = await apiFetch<{ conversations: RawConversation[]; projects: RawConversationProject[] }>(
        "/api/conversations"
      );
      if (res.ok && res.data) {
        setConversations(res.data.conversations || []);
        setProjects(res.data.projects || []);
      } else {
        setError(res.error || "Failed to load connections");
      }
      setLoading(false);
    })();
  }, []);

  const rows = toConnectionRows(conversations, projects, userId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Connections"
        subtitle="Brands and creators you've collaborated with."
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <div className="px-6 py-10 text-center text-sm font-semibold text-danger">{error}</div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No connections yet"
            description="Accept a collaboration request to start building your network."
            action={
              <ButtonLink href="/dashboard/requests" variant="brandSoft" size="sm">
                View requests
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-hairline p-0">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() =>
                row.conversationId
                  ? router.push(`/dashboard/messages?conv=${row.conversationId}`)
                  : router.push("/dashboard/messages")
              }
              className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-surface-muted sm:px-6"
            >
              <Avatar name={row.name ?? undefined} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-content">{row.name}</p>
                  {row.role === "business_owner" && (
                    <Badge variant="neutral" size="sm">Brand</Badge>
                  )}
                  {row.role === "influencer" && (
                    <Badge variant="brand" size="sm">Creator</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-content-muted">
                  {row.preview
                    ? row.preview
                    : row.projectTitle
                      ? `Working on ${row.projectTitle}`
                      : "Connected"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-content-muted">
                <MessageSquare size={13} />
                {timeAgo(row.lastActivityAt)}
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
