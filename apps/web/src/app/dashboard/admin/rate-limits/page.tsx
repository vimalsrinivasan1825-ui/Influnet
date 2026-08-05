"use client";

/**
 * Rate-limit visibility — observe only, no new enforcement.
 *
 * rate-limit.ts has guarded ~30 routes since the 2026-07-14 hardening pass
 * but never recorded a single hit — a 429 vanished into a log line with no
 * bucket or caller attached. This is the first place that question can be
 * answered without a manual DB query: which endpoints are getting hit, how
 * often, by whom, and how many of those hits actually got rate-limited.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Gauge, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, TRow } from "@/components/ui/table";

interface Caller {
  identity: string;
  kind: "user" | "ip";
  label: string;
  requestCount: number;
  limitedCount: number;
}

interface BucketStat {
  bucket: string;
  requestCount: number;
  limitedCount: number;
  limitValue: number | null;
  distinctCallers: number;
  topCallers: Caller[];
}

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 24 * 7, label: "7d" },
  { hours: 24 * 30, label: "30d" },
];

export default function AdminRateLimitsPage() {
  const [buckets, setBuckets] = useState<BucketStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hours, setHours] = useState(24);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (h: number) => {
    setLoading(true);
    const res = await apiFetch<{ buckets: BucketStat[] }>(`/api/admin/rate-limits?hours=${h}`);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load rate-limit stats");
    } else {
      setError("");
      setBuckets(res.data.buckets || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  const totalRequests = buckets.reduce((sum, b) => sum + b.requestCount, 0);
  const totalLimited = buckets.reduce((sum, b) => sum + b.limitedCount, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Traffic"
        title="Rate limits"
        subtitle={
          loading
            ? "Loading…"
            : `${totalRequests.toLocaleString()} requests · ${totalLimited.toLocaleString()} rate-limited in the last ${WINDOWS.find((w) => w.hours === hours)?.label}`
        }
        icon={<Gauge />}
        actions={
          <div className="flex items-center gap-2">
            {WINDOWS.map((w) => (
              <Button
                key={w.hours}
                size="sm"
                variant={hours === w.hours ? "default" : "secondary"}
                onClick={() => setHours(w.hours)}
              >
                {w.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => load(hours)}>
              <RefreshCw />
            </Button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : buckets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gauge />}
            title="No traffic recorded"
            description="Requests to rate-limited endpoints will appear here as they happen."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <th></th>
                <th>Endpoint</th>
                <th>Requests</th>
                <th>Rate-limited</th>
                <th className="hidden sm:table-cell">Limit</th>
                <th className="hidden md:table-cell">Callers</th>
              </tr>
            </THead>
            <TBody>
              {buckets.map((b) => {
                const isOpen = expanded === b.bucket;
                return (
                  <Fragment key={b.bucket}>
                    <TRow
                      interactive
                      onClick={() => setExpanded(isOpen ? null : b.bucket)}
                    >
                      <td className="w-6 text-content-muted">
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </td>
                      <td className="text-sm font-bold text-content">{b.bucket}</td>
                      <td className="text-sm text-content">{b.requestCount.toLocaleString()}</td>
                      <td>
                        {b.limitedCount > 0 ? (
                          <Badge variant="warning" size="sm">
                            {b.limitedCount.toLocaleString()}
                          </Badge>
                        ) : (
                          <span className="text-sm text-content-muted">0</span>
                        )}
                      </td>
                      <td className="hidden text-sm text-content-soft sm:table-cell">
                        {b.limitValue ?? "—"}
                      </td>
                      <td className="hidden text-sm text-content-soft md:table-cell">{b.distinctCallers}</td>
                    </TRow>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="bg-surface-soft px-4 py-3">
                          {b.topCallers.length === 0 ? (
                            <span className="text-xs text-content-muted">No callers recorded.</span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {b.topCallers.map((c) => (
                                <div
                                  key={c.identity}
                                  className="flex items-center justify-between gap-3 text-xs"
                                >
                                  <span className="flex items-center gap-2 text-content-soft">
                                    <Badge variant={c.kind === "user" ? "info" : "neutral"} size="sm">
                                      {c.kind === "user" ? "User" : "IP"}
                                    </Badge>
                                    {c.label}
                                  </span>
                                  <span className="font-semibold text-content">
                                    {c.requestCount.toLocaleString()} req
                                    {c.limitedCount > 0 && (
                                      <span className="ml-1.5 text-danger">
                                        · {c.limitedCount.toLocaleString()} limited
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
