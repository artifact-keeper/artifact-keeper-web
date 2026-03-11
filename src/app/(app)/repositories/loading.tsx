import { Skeleton } from "@/components/ui/skeleton";

export default function RepositoriesLoading() {
  return (
    <div className="space-y-6">
      {/* Header with search and create button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Repository list */}
      <div className="space-y-2">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => (
          <Skeleton key={id} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
