"use client";

/**
 * Break-glass: which third parties are in the request path right now.
 *
 * This is the screen to open when "something is broken and I don't know
 * what". It answers one question per row — is this vendor serving? — and
 * separates the two reasons it might not be:
 *
 *   the SWITCH   you turned it off (feature_flags, migration 149). Shared
 *                across instances, survives deploys, ~45s to take effect.
 *   the BREAKER  the app gave up calling it after repeated failures.
 *                Per-instance, automatic, clears itself.
 *
 * Deliberately READ-ONLY. Flipping a switch is a service-role write, and
 * putting a "disable payments" button behind a session cookie is a worse
 * trade than copying one SQL statement — so the page hands you the exact
 * statement instead. The value here is knowing, in one place, at 2am.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, PlugZap, RefreshCw, ShieldOff } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface Vendor {
  key: string;
  enabled: boolean;
  breaker: "closed" | "open" | "half-open";
  consecutive_failures: number;
  retry_in_ms: number;
  configured: boolean;
  credential: string | null;
  impact: string;
  serving: boolean;
}

const LABEL: Record<string, string> = {
  vendor_apify: "Apify — Instagram scraping",
  vendor_hikerapi: "HikerAPI — Instagram (alternate)",
  vendor_razorpay: "Razorpay — payments",
  vendor_stream: "Stream — chat",
  vendor_resend: "Resend — email",
  vendor_expo_push: "Expo — push notifications",
};

function sqlFor(key: string, enable: boolean) {
  const note = enable ? "re-enabled" : `disabled ${new Date().toISOString()}`;
  return `insert into public.feature_flags (key, enabled, description)
values ('${key}', ${enable}, '${note}')
on conflict (key) do update
  set enabled = excluded.enabled, description = excluded.description;`;
}

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/admin/vendors");
      if (!res.ok) throw new Error(res.error || "Could not load vendor status");
      // /api/admin/vendors returns { vendors }. Per this repo's envelope rule,
      // read the route rather than guessing a shared shape.
      setVendors((res.data?.vendors as Vendor[] | undefined) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load vendor status");
      setVendors([]);
    }
  }, []);

  useEffect(() => {
    void load();
    // The breakers move on their own, so this screen is only useful if it
    // keeps up with them. 15s is well inside the shortest cooldown (15s for
    // Razorpay) without being a poll storm.
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const copy = async (key: string, sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — the SQL is on screen to select by hand */
    }
  };

  const degraded = (vendors ?? []).filter((v) => v.configured && !v.serving);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        subtitle="Which third parties are in the request path right now, and why any of them are not."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</Card>
      )}

      {vendors === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {degraded.length === 0 ? (
            <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-900">
                Every configured vendor is serving. This is the boring answer you want.
              </p>
            </Card>
          ) : (
            <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">
                  {degraded.length} vendor{degraded.length > 1 ? "s are" : " is"} out of the request
                  path.
                </p>
                <p className="mt-1">
                  A <strong>switch</strong> means someone turned it off. A <strong>breaker</strong>{" "}
                  means the app gave up after repeated failures and will retry on its own.
                </p>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {vendors.map((v) => {
              const off = !v.enabled;
              const tripped = v.breaker === "open";
              return (
                <Card key={v.key} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{LABEL[v.key] ?? v.key}</h3>
                        {!v.configured ? (
                          <Badge variant="neutral">Not configured</Badge>
                        ) : v.serving ? (
                          <Badge variant="success">Serving</Badge>
                        ) : (
                          <Badge variant="danger">Not serving</Badge>
                        )}
                        {off && (
                          <Badge variant="warning">
                            <ShieldOff className="mr-1 h-3 w-3" />
                            Switched off
                          </Badge>
                        )}
                        {tripped && (
                          <Badge variant="warning">
                            <PlugZap className="mr-1 h-3 w-3" />
                            Breaker open · retry in {Math.ceil(v.retry_in_ms / 1000)}s
                          </Badge>
                        )}
                        {v.breaker === "half-open" && (
                          <Badge variant="info">Probing recovery</Badge>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-muted-foreground">{v.impact}</p>

                      {!v.configured && v.credential && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No <code>{v.credential}</code> on this deployment, so the switch is moot.
                        </p>
                      )}
                      {v.consecutive_failures > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {v.consecutive_failures} consecutive failure
                          {v.consecutive_failures > 1 ? "s" : ""} on this instance.
                        </p>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copy(v.key, sqlFor(v.key, off))}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {copied === v.key ? "Copied" : off ? "Copy re-enable SQL" : "Copy disable SQL"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How to actually flip one</p>
            <p className="mt-1">
              Run the copied statement in the Supabase SQL editor for{" "}
              <strong>this environment&apos;s project</strong>. It takes effect within about 45
              seconds — no deploy. Writes need the service role, which is why this page hands you
              SQL instead of a button.
            </p>
            <p className="mt-2">
              Breaker state is per-instance and resets on deploy; switch state is shared and
              durable. With more than one replica, breaker numbers here describe whichever instance
              answered this request.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
