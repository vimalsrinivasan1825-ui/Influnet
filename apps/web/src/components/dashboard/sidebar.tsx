"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  Send,
  FolderKanban,
  Users,
  Settings,
  Shield,
  BadgeCheck,
  Compass,
  Building2,
  PanelLeftClose,
  PanelLeft,
  X,
  History,
  LayoutDashboard,
  UserRound,
  BarChart3,
  Inbox,
  MessageSquareHeart,
  ShieldAlert,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "unread" | "pending";
};

const CREATOR_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard/home", icon: Home },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Public profile", href: "/dashboard/profile", icon: UserRound },
  { label: "Messages", href: "/dashboard/messages", icon: MessageSquare, badge: "unread" },
  { label: "Requests", href: "/dashboard/requests", icon: Send, badge: "pending" },
  { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Connections", href: "/dashboard/connections", icon: Users },
  { label: "My activity", href: "/dashboard/activity", icon: History },
];

const BUSINESS_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard/home", icon: Home },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Public profile", href: "/dashboard/profile", icon: UserRound },
  { label: "Messages", href: "/dashboard/messages", icon: MessageSquare, badge: "unread" },
  { label: "Requests", href: "/dashboard/requests", icon: Send, badge: "pending" },
  { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Connections", href: "/dashboard/connections", icon: Users },
  { label: "My activity", href: "/dashboard/activity", icon: History },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard/admin", icon: Shield },
  { label: "Analytics", href: "/dashboard/admin/analytics", icon: BarChart3 },
  { label: "Approvals", href: "/dashboard/admin/approvals", icon: BadgeCheck, badge: "pending" },
  { label: "Support", href: "/dashboard/admin/support", icon: Inbox },
  // Reports had a working API since migration 056 and no screen at all — every
  // harassment report filed by a user went into a table nobody could read.
  { label: "Reports", href: "/dashboard/admin/reports", icon: ShieldAlert },
  { label: "Feedback", href: "/dashboard/admin/feedback", icon: MessageSquareHeart },
  { label: "Users", href: "/dashboard/admin/users", icon: Users },
  { label: "Projects", href: "/dashboard/admin/projects", icon: FolderKanban },
  { label: "Requests", href: "/dashboard/admin/collabs", icon: Send },
  { label: "Audit log", href: "/dashboard/admin/audit", icon: History },
];

const ROLE_META: Record<
  UserRole,
  { label: string; short: string; nav: NavItem[]; icon: LucideIcon }
> = {
  influencer: { label: "Creator", short: "C", nav: CREATOR_NAV, icon: Users },
  business_owner: { label: "Business", short: "B", nav: BUSINESS_NAV, icon: Building2 },
  admin: { label: "Admin", short: "A", nav: ADMIN_NAV, icon: Shield },
};

function NavList({
  items,
  collapsed,
  unreadMessages,
  pendingRequests,
  role,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  unreadMessages: number;
  pendingRequests: number;
  role: UserRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isCreator = role === "influencer";
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
        const count =
          item.badge === "unread"
            ? unreadMessages
            : item.badge === "pending"
              ? pendingRequests
              : 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              collapsed && "justify-center px-0",
              active
                ? isCreator
                  ? "bg-white/20 text-white"
                  : "bg-brand-soft text-brand-strong"
                : isCreator
                  ? "text-white/70 hover:bg-white/10 hover:text-white"
                  : "text-content-soft hover:bg-surface-muted hover:text-content",
            )}
          >
            {active && !collapsed && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />
            )}
            <Icon className="size-[1.15rem] shrink-0" />
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {count > 0 &&
              (collapsed ? (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-surface-card" />
              ) : (
                <span className="min-w-5 rounded-full bg-brand px-1.5 py-0.5 text-center text-[0.625rem] font-bold text-white tabular-nums">
                  {count > 99 ? "99+" : count}
                </span>
              ))}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed, role }: { collapsed: boolean; role: UserRole }) {
  const isCreator = role === "influencer";
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image src="/influet_logo.png" alt="" width={28} height={28} className="size-7 shrink-0" />
      {!collapsed && (
        <span className={cn("text-lg font-extrabold tracking-tight", isCreator ? "text-white" : "text-content")}>influnet</span>
      )}
    </Link>
  );
}

function RolePill({ role, collapsed }: { role: UserRole; collapsed: boolean }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <div className="px-3 pt-3">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5",
          role === "influencer" ? "bg-white/10 text-white" : "bg-brand-soft text-brand-strong",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        {!collapsed && (
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em]">
            {meta.label} workspace
          </span>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  role: UserRole;
  unreadMessages?: number;
  pendingRequests?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function DashboardSidebar({
  role,
  unreadMessages = 0,
  pendingRequests = 0,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const meta = ROLE_META[role] ?? ROLE_META.influencer;

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
          role === "influencer" ? "bg-brand text-white border-brand-strong" : "bg-surface-card border-hairline",
          collapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b px-4",
            role === "influencer" ? "border-white/10" : "border-hairline",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && <Brand collapsed={false} role={role} />}
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              role === "influencer" 
                ? "text-white/70 hover:bg-white/10 hover:text-white" 
                : "text-content-muted hover:bg-surface-muted hover:text-content"
            )}
          >
            {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>

        <RolePill role={role} collapsed={collapsed} />
        <NavList
          items={meta.nav}
          collapsed={collapsed}
          unreadMessages={unreadMessages}
          pendingRequests={pendingRequests}
          role={role}
        />

        <div className={cn("border-t px-3 py-3", role === "influencer" ? "border-white/10" : "border-hairline")}>
          <SidebarFooter collapsed={collapsed} role={role} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-content/40 backdrop-blur-sm transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={onCloseMobile}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-[17rem] max-w-[82vw] flex-col border-r shadow-[var(--shadow-pop)] transition-transform duration-200",
            role === "influencer" ? "bg-brand text-white border-brand-strong" : "bg-surface-card border-hairline",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className={cn("flex h-16 items-center justify-between border-b px-4", role === "influencer" ? "border-white/10" : "border-hairline")}>
            <Brand collapsed={false} role={role} />
            <button
              onClick={onCloseMobile}
              aria-label="Close menu"
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                role === "influencer" ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-content-muted hover:bg-surface-muted hover:text-content"
              )}
            >
              <X className="size-5" />
            </button>
          </div>
          <RolePill role={role} collapsed={false} />
          <NavList
            items={meta.nav}
            collapsed={false}
            unreadMessages={unreadMessages}
            pendingRequests={pendingRequests}
            onNavigate={onCloseMobile}
            role={role}
          />
          <div className={cn("border-t px-3 py-3", role === "influencer" ? "border-white/10" : "border-hairline")}>
            <SidebarFooter collapsed={false} onNavigate={onCloseMobile} role={role} />
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * A link in the sidebar footer. Generalised from the old SettingsLink so
 * Support can sit beside Settings without a second copy of the same styling.
 */
function FooterLink({
  href,
  label,
  icon: Icon,
  collapsed,
  role,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  role: UserRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  const isCreator = role === "influencer";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
        collapsed && "justify-center px-0",
        active
          ? isCreator ? "bg-white/20 text-white" : "bg-brand-soft text-brand-strong"
          : isCreator ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-content-soft hover:bg-surface-muted hover:text-content",
      )}
    >
      <Icon className="size-[1.15rem] shrink-0" />
      {!collapsed && label}
    </Link>
  );
}

/**
 * Support + Settings. Support is shown to admins too — an admin is still a
 * user of the product, and hiding it would mean the person answering tickets
 * cannot see what the flow looks like from the other side.
 */
function SidebarFooter({
  collapsed,
  role,
  onNavigate,
}: {
  collapsed: boolean;
  role: UserRole;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FooterLink
        href="/dashboard/support"
        label="Help & support"
        icon={LifeBuoy}
        collapsed={collapsed}
        role={role}
        onNavigate={onNavigate}
      />
      {role !== "admin" && (
        <FooterLink
          href="/dashboard/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
          role={role}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
