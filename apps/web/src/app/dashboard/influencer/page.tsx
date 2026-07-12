"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { InfluencerHomeView } from "@/components/dashboard/views/influencer-home";
import { HomeSkeleton } from "@/components/dashboard/views/home-skeleton";
import type { InfluencerHomeData } from "@/components/dashboard/views/types";

const FALLBACK: InfluencerHomeData = {
  profile: {
    name: "Creator",
    username: "",
    niche: [],
    is_verified: false,
    headline: null,
    avatar_url: null,
    bio: null,
    location: null,
  },
  stats: {
    collab_requests: 0,
    active_discussions: 0,
    active_projects: 0,
    completed_projects: 0,
    pipeline_value: 0,
  },
  earnings_trend: [],
  request_breakdown: [],
  recent_collabs: null,
};

export default function InfluencerDashboardPage() {
  const [data, setData] = useState<InfluencerHomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<InfluencerHomeData>("/api/influencer/dashboard");
        if (res.ok && res.data) setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <HomeSkeleton />;
  return <InfluencerHomeView data={data ?? FALLBACK} />;
}
