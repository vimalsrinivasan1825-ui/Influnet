"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { BusinessHomeView } from "@/components/dashboard/views/business-home";
import { InfluencerHomeView } from "@/components/dashboard/views/influencer-home";
import { HomeSkeleton } from "@/components/dashboard/views/home-skeleton";
import type { BusinessHomeData, InfluencerHomeData } from "@/components/dashboard/views/types";

const BUSINESS_FALLBACK: BusinessHomeData = {
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

const CREATOR_FALLBACK: InfluencerHomeData = {
  profile: {
    name: "Creator",
    username: null,
    niche: [],
    verified_badge: false,
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
    proposals_awaiting_you: 0,
  },
  earnings_trend: [],
  request_breakdown: [],
  recent_collabs: null,
  active_roster: null,
};

/**
 * The analytics Dashboard, for both roles.
 *
 * Creators used to be bounced to /dashboard/influencer, which rendered the
 * same InfluencerHomeView this does — an asymmetry that left the creator's
 * Dashboard on a role-named URL while the business one sat on /dashboard, and
 * put the same redirect decision in two places (here and the shell). Both
 * roles now render in place; /dashboard/influencer redirects here so existing
 * links and bookmarks keep working.
 *
 * Distinct from /dashboard/home, which is the "whose move is it" action
 * console rather than an analytics view.
 */
export default function DashboardPage() {
  const [role, setRole] = useState<"business_owner" | "influencer" | null>(null);
  const [businessData, setBusinessData] = useState<BusinessHomeData | null>(null);
  const [creatorData, setCreatorData] = useState<InfluencerHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Whether this effect ends by redirecting away — if so, we deliberately
    // keep showing the loading skeleton instead of flipping `loading` to
    // false, so no fallback content flashes while router.replace() completes.
    let redirected = false;

    (async () => {
      try {
        // getUser() (not getSession()) forces a round trip to Supabase rather
        // than trusting a possibly-stale local session, so this can't be
        // fooled by a client that hasn't finished rehydrating yet. An
        // unresolved role NEVER falls through to rendering either view — that
        // was the original bug here: a creator whose profile query hiccuped
        // silently saw an empty "Your brand ₹0" business page.
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
        const resolvedRole = (profileData as { role?: string } | null)?.role;

        if (profileErr || !resolvedRole) {
          // Can't confirm who's asking — don't guess, and don't render either
          // dashboard on an unresolved role. Force a fresh sign-in, the same
          // fallback the dashboard shell uses.
          redirected = true;
          router.replace("/login");
          return;
        }
        if (resolvedRole === "admin") {
          redirected = true;
          router.replace("/dashboard/admin");
          return;
        }

        if (resolvedRole === "influencer") {
          setRole("influencer");
          const res = await apiFetch<InfluencerHomeData>("/api/influencer/dashboard");
          if (res.ok && res.data) setCreatorData(res.data);
        } else {
          setRole("business_owner");
          const res = await apiFetch<BusinessHomeData>("/api/business/dashboard");
          if (res.ok && res.data) setBusinessData(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!redirected) setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !role) return <HomeSkeleton />;
  return role === "influencer" ? (
    <InfluencerHomeView data={creatorData ?? CREATOR_FALLBACK} />
  ) : (
    <BusinessHomeView data={businessData ?? BUSINESS_FALLBACK} />
  );
}
