"use client";

import { useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface BlockRow {
  blocked_id: string;
  created_at: string;
  blocked?: { id: string; name: string | null; role: string | null } | null;
}

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

/**
 * "Block/report" is fully wired API + DB (migration 076's is_blocked_pair
 * RESTRICTIVE policy, /api/blocks) but had no UI anywhere — the 2026-07-30
 * audit flagged it as unreachable. This is the missing read/unblock surface,
 * matching apps/mobile/app/blocked-accounts.tsx so a block made on either
 * platform is visible and reversible from the other. Creating a block itself
 * happens from the report-user flow on a project (see BlockUserButton).
 */
export function BlockedAccountsPanel() {
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await apiFetch<{ blocks: BlockRow[] }>("/api/blocks");
    if (res.ok && res.data) setRows(res.data.blocks || []);
    else setError(res.error || "Failed to load blocked accounts");
  };

  useEffect(() => {
    void load();
  }, []);

  const unblock = async (blockedId: string) => {
    setRemovingId(blockedId);
    const res = await apiFetch("/api/blocks", {
      method: "DELETE",
      body: JSON.stringify({ blocked_id: blockedId }),
    });
    setRemovingId(null);
    if (!res.ok) {
      toast.error(res.error || "Failed to unblock");
      return;
    }
    setRows((prev) => (prev || []).filter((r) => r.blocked_id !== blockedId));
    toast.success("Unblocked");
  };

  if (rows === null && !error) {
    return (
      <div className="flex flex-col gap-2 p-5 sm:p-6">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 text-sm font-semibold text-danger sm:p-6">{error}</div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-5 sm:p-6">
        <EmptyState
          icon={<ShieldOff />}
          title="No blocked accounts"
          description="Accounts you block can't message you or send collaboration requests. Block someone from the report dialog on a project."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-hairline">
      {rows.map((row) => (
        <div key={row.blocked_id} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={row.blocked?.name ?? undefined} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-content">
                {row.blocked?.name ?? "Unknown account"}
              </p>
              <p className="text-xs text-content-muted">Blocked {timeAgo(row.created_at)}</p>
            </div>
          </div>
          <Button
            variant="surface"
            size="sm"
            onClick={() => unblock(row.blocked_id)}
            disabled={removingId === row.blocked_id}
          >
            {removingId === row.blocked_id ? "Unblocking…" : "Unblock"}
          </Button>
        </div>
      ))}
    </div>
  );
}
