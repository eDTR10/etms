import { cn } from "../../lib/utils";

// ── Base Skeleton block ───────────────────────────────────────────────────
interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => (
  <div
    className={cn(
      "animate-pulse rounded-md bg-muted",
      className
    )}
  />
);

// ── Preset skeletons used across app pages ────────────────────────────────

/** 4-card stat row */
export const StatCardsSkeleton = () => (
  <div className="grid grid-cols-4 gap-4 mb-6 lg:grid-cols-2 sm:grid-cols-1">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    ))}
  </div>
);

/** Table with rows */
export const TableSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="bg-card border border-border rounded-xl overflow-hidden">
    {/* Header */}
    <div className="px-5 py-4 border-b border-border flex gap-4">
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-20" />
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="px-5 py-3.5 border-b border-border last:border-0 flex gap-4 items-center">
        <div className="flex items-center gap-3 flex-1">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-44" />
          </div>
        </div>
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    ))}
  </div>
);

/** Form field */
export const FormFieldSkeleton = () => (
  <div className="flex flex-col gap-1.5">
    <Skeleton className="h-3.5 w-24" />
    <Skeleton className="h-10 w-full rounded-lg" />
  </div>
);

/** Activity list */
export const ActivitySkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="flex flex-col divide-y divide-border">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
        <Skeleton className="h-2.5 w-14 shrink-0" />
      </div>
    ))}
  </div>
);

/** Profile avatar + fields */
export const ProfileSkeleton = () => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center gap-5 sm:flex-col sm:items-start">
      <Skeleton className="w-20 h-20 rounded-full shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}
    </div>
  </div>
);
