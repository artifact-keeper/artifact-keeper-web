import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["a", "b", "c", "d"].map((id) => (
          <Skeleton key={id} className="h-[100px] rounded-xl" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border">
        <Skeleton className="h-10 rounded-t-xl rounded-b-none" />
        <div className="space-y-3 p-4">
          {["a", "b", "c", "d", "e", "f"].map((id) => (
            <Skeleton key={id} className="h-10 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
