import { Skeleton } from "@/components/ui/skeleton";

export default function StagingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
      </div>

      {/* Staging repos grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((id) => (
          <Skeleton key={id} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
