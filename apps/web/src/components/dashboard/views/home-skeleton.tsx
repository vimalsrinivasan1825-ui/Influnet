import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Layout-matched loading state for the role dashboard homes. */
export function HomeSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-4 h-[220px] w-full rounded-xl" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mx-auto mt-4 size-[180px] rounded-full" />
        </Card>
      </div>
    </div>
  );
}
