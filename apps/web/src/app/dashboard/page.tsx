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
    // Whether this effect ends by redirecting away — if so, we deliberately
    // keep showing the loading skeleton instead of flipping `loading` to
    // false, so the fallback business content never has a chance to flash
    // on screen while router.replace() is still completing the navigation.
    let redirected = false;

    (async () => {
      try {
        // Role gate: influencers and admins don't belong on the business
        // dashboard. Mirror the role-routing that login does post-login.
        //
        // getUser() (not getSession()) forces a round trip to Supabase rather
        // than trusting a possibly-stale local session, so this can't be
        // fooled by a client that hasn't finished rehydrating yet. And unlike
        // the previous version, an unresolved role NEVER falls through to
        // rendering the business dashboard anyway — that was the actual bug:
        // a creator whose profile query hiccuped, or whose session hadn't
        // rehydrated, silently saw an empty "Your brand ₹0" business page
        // instead of being routed to their own dashboard.
        const supabaseClient = createClient();
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
          redirected = true;
          router.replace("/login");
          return;
        }

        const { data: profileData, error: profileErr } = await supabaseClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        const role = (profileData as { role?: string } | null)?.role;

        if (profileErr || !role) {
          // Can't confirm this account is a business — don't guess and don't
          // render the business view on an unresolved role. Force a fresh
          // sign-in, the same fallback the dashboard shell uses when it can't
          // establish who's asking.
          redirected = true;
          router.replace("/login");
          return;
        }
        if (role === "influencer") {
          redirected = true;
          router.replace("/dashboard/influencer");
          return;
        }
        if (role === "admin") {
          redirected = true;
          router.replace("/dashboard/admin");
          return;
        }

        const res = await apiFetch<BusinessHomeData>("/api/business/dashboard");
        if (res.ok && res.data) setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!redirected) setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <HomeSkeleton />;
  return <BusinessHomeView data={data ?? FALLBACK} />;
}
