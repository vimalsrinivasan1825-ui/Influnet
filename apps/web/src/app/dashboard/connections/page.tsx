"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";

export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Connections"
        subtitle="Brands and creators you've collaborated with."
      />
      <Card>
        <EmptyState
          icon={<Users />}
          title="No connections yet"
          description="Accept a collaboration request to start building your network."
          action={
            <ButtonLink href="/dashboard/requests" variant="brandSoft" size="sm">
              View requests
            </ButtonLink>
          }
        />
      </Card>
    </div>
  );
}
