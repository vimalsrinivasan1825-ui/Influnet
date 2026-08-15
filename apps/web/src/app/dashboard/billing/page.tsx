"use client";

/**
 * Plan & billing.
 *
 * The page is reachable whether or not paid plans exist in this environment —
 * a 404 route that appears and disappears with an env var is worse to debug
 * than a page that explains itself. What changes is the content: with
 * subscriptions off, it says so plainly rather than showing a price nobody can
 * pay.
 */

import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeCard } from "@/components/dashboard/upgrade-card";
import { useEntitlements } from "@/lib/hooks/use-entitlements";

export default function BillingPage() {
  const { entitlements, loading, refresh } = useEntitlements();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      <PageHeader
        title="Plan & billing"
        subtitle="What your account can do today, and what changes if you upgrade."
      />

      {loading && (
        <Card className="max-w-xl p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </Card>
      )}

      {!loading && !entitlements && (
        <Card className="max-w-xl p-5">
          <p className="text-sm text-content-soft">
            We could not load your plan just now. Refresh the page to try again.
          </p>
        </Card>
      )}

      {!loading && entitlements && !entitlements.subscriptionsEnabled && (
        <Card className="max-w-xl p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-content-muted" aria-hidden />
            <h3 className="text-base font-semibold">Everything is included</h3>
          </div>
          <p className="mt-2 text-sm text-content-soft">
            Paid plans are not switched on for this environment, so your account
            has no limits — every feature is available. There is nothing to buy
            and nothing to manage here.
          </p>
        </Card>
      )}

      {!loading && entitlements && entitlements.subscriptionsEnabled && (
        <UpgradeCard entitlements={entitlements} onUpgraded={refresh} />
      )}
    </div>
  );
}
