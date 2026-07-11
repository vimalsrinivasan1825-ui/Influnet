"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { AdminHomeView } from "@/components/dashboard/views/admin-home";
import { HomeSkeleton } from "@/components/dashboard/views/home-skeleton";
import type { AdminHomeData } from "@/components/dashboard/views/types";

const FALLBACK: AdminHomeData = {
  total_users: 0,
  total_businesses: 0,
  total_influencers: 0,
  pending_approvals: 0,
  total_collabs: 0,
  active_collabs: 0,
  pending_collabs: 0,
  active_projects: 0,
  completed_projects: 0,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ stats: AdminHomeData }>("/api/admin/dashboard");
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load admin data");
        setStats(res.data.stats);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <HomeSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  return <AdminHomeView data={stats ?? FALLBACK} />;
}
