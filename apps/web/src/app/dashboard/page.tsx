"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { BusinessHomeView } from "@/components/dashboard/views/business-home";
import { HomeSkeleton } from "@/components/dashboard/views/home-skeleton";
import type { BusinessHomeData } from "@/components/dashboard/views/types";

const FALLBACK: BusinessHomeData = {
  profile: { name: "there", company_name: "Your brand", industry: "" },
  stats: {
    active_collabs_count: 0,
    completed_collabs_count: 0,
    pending_collabs_count: 0,
    pipeline_value: 0,
  },
  weekly_spend: [],
  pipeline_data: [],
  recent_collabs: null,
};

export default function BusinessDashboardPage() {
  const [data, setData] = useState<BusinessHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        // Role gate: influencers and admins don't belong on the business
        // dashboard. Mirror the role-routing that login does post-login.
        const supabaseClient = createClient();
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (session) {
          const { data: profileData } = await supabaseClient
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single();
          const role = (profileData as { role?: string } | null)?.role;
          if (role === "influencer") {
            router.replace("/dashboard/influencer");
            return;
          }
          if (role === "admin") {
            router.replace("/dashboard/admin");
            return;
          }
        }

        const res = await apiFetch<BusinessHomeData>("/api/business/dashboard");
        if (res.ok && res.data) setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <HomeSkeleton />;
  return <BusinessHomeView data={data ?? FALLBACK} />;
}
