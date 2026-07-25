"use client";

/**
 * No-auth visual harness for the dashboard design system. Renders the role
 * home views with mock data so the UI can be reviewed without a live session.
 * Not linked in navigation; safe to keep for design QA.
 */
import { useState } from "react";
import { InfluencerHomeView } from "@/components/dashboard/views/influencer-home";
import { BusinessHomeView } from "@/components/dashboard/views/business-home";
import { AdminHomeView } from "@/components/dashboard/views/admin-home";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";
import { SegmentedTabs } from "@/components/ui/tabs";
import type { UserRole } from "@/types";
import type {
  AdminHomeData,
  BusinessHomeData,
  InfluencerHomeData,
} from "@/components/dashboard/views/types";

const influencer: InfluencerHomeData = {
  profile: {
    name: "Priya Sharma",
    username: "priyacreates",
    niche: ["Beauty", "Skincare", "Lifestyle"],
    is_verified: true,
    headline: "Beauty & skincare creator helping brands reach Gen-Z in South India.",
    avatar_url: null,
    bio: null,
    location: "Chennai, India",
  },
  stats: {
    collab_requests: 6,
    active_discussions: 4,
    active_projects: 3,
    completed_projects: 18,
    pipeline_value: 486500,
    proposals_awaiting_you: 2,
  },
  earnings_trend: [
    { week: "W1", amount: 32000 },
    { week: "W2", amount: 41000 },
    { week: "W3", amount: 38500 },
    { week: "W4", amount: 52000 },
    { week: "W5", amount: 47000 },
    { week: "W6", amount: 61000 },
  ],
  request_breakdown: [
    { name: "Pending", value: 6, fill: "#d97706" },
    { name: "Active", value: 3, fill: "#2563eb" },
    { name: "Completed", value: 18, fill: "#16a34a" },
    { name: "Declined", value: 2, fill: "#dc2626" },
  ],
  recent_collabs: [
    { id: "1", name: "Lumé Skincare", amount: "₹80,000", status: "In Progress", sender_id: "a" },
    { id: "2", name: "Aether Apparel", amount: "₹1,20,000", status: "Completed", sender_id: "b" },
    { id: "3", name: "Wanderly Travel", amount: "₹45,000", status: "Pending", sender_id: "c" },
  ],
  active_roster: [
    { id: 1, brand_name: "Lumé Skincare", project_title: "Spring Glow Campaign" },
    { id: 2, brand_name: "Aether Apparel", project_title: "Monsoon Capsule" },
  ],
};

const business: BusinessHomeData = {
  profile: { name: "Rahul", company_name: "Lumé Skincare", industry: "Beauty & Personal Care" },
  stats: {
    active_collabs_count: 7,
    completed_collabs_count: 24,
    pending_collabs_count: 5,
    pipeline_value: 1875000,
  },
  weekly_spend: [
    { week: "W1", spend: 120000 },
    { week: "W2", spend: 185000 },
    { week: "W3", spend: 142000 },
    { week: "W4", spend: 224000 },
    { week: "W5", spend: 198000 },
    { week: "W6", spend: 265000 },
  ],
  pipeline_data: [
    { name: "Proposals", value: 12, fill: "#d97706" },
    { name: "Active", value: 7, fill: "#2563eb" },
    { name: "Completed", value: 24, fill: "#16a34a" },
  ],
  recent_collabs: [
    { id: "1", name: "Priya Sharma", amount: "₹80,000", status: "In Progress", platform: "Instagram", reach: "412K" },
    { id: "2", name: "Arjun Mehta", amount: "₹1,50,000", status: "Completed", platform: "YouTube", reach: "1.2M" },
    { id: "3", name: "Neha Kapoor", amount: "₹65,000", status: "Pending", platform: "Instagram", reach: "280K" },
    { id: "4", name: "Wander Films", amount: "₹2,10,000", status: "Active", platform: "YouTube", reach: "890K" },
  ],
};

const admin: AdminHomeData = {
  total_users: 1842,
  total_businesses: 386,
  total_influencers: 1456,
  pending_approvals: 12,
  total_collabs: 934,
  active_collabs: 217,
  pending_collabs: 88,
  active_projects: 143,
  completed_projects: 512,
};

type Role = "influencer" | "business" | "admin";
const THEME: Record<Role, string> = {
  business: "theme-brand",
  influencer: "theme-creator",
  admin: "theme-admin",
};
const ROLE_TO_USERROLE: Record<Role, UserRole> = {
  influencer: "influencer",
  business: "business_owner",
  admin: "admin",
};

export default function UiPreviewPage() {
  const [role, setRole] = useState<Role>("influencer");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={`${THEME[role]} flex min-h-screen bg-surface text-content`}>
      <DashboardSidebar
        role={ROLE_TO_USERROLE[role]}
        unreadMessages={3}
        pendingRequests={6}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          userName={role === "business" ? "Rahul" : role === "admin" ? "Admin" : "Priya Sharma"}
          avatarUrl={null}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-card/60 px-4 py-2 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            UI preview — mock data
          </p>
          <SegmentedTabs
            value={role}
            onValueChange={setRole}
            size="sm"
            tabs={[
              { value: "influencer", label: "Creator" },
              { value: "business", label: "Business" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>
        <main className="flex-1">
          {role === "influencer" && <InfluencerHomeView data={influencer} />}
          {role === "business" && <BusinessHomeView data={business} />}
          {role === "admin" && <AdminHomeView data={admin} />}
        </main>
      </div>
    </div>
  );
}
