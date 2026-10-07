"use client";

/**
 * Any person shown anywhere in the admin console should open their full page
 * (/dashboard/admin/users/[id]: who they are, where they are right now, and
 * their whole journey). This is the one way to link there, so a name in a
 * queue, a report row or the audit log all behave the same.
 *
 * Renders plain text when there is no id (a deleted account, a lead that
 * never signed up) rather than a link to a page that would 404.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function adminUserHref(id: string): string {
  return `/dashboard/admin/users/${id}`;
}

export function AdminUserLink({
  id,
  children,
  className,
  showIcon = false,
}: {
  id: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  /** A small ↗ after the label, for places where the link isn't obvious. */
  showIcon?: boolean;
}) {
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link
      href={adminUserHref(id)}
      // Rows that hold a link are often clickable themselves; don't fire both.
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex items-center gap-0.5 hover:text-brand hover:underline", className)}
    >
      {children}
      {showIcon && <ArrowUpRight className="size-3 shrink-0" />}
    </Link>
  );
}
