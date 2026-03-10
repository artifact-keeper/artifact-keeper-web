import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="rounded-xl border">
        <Skeleton className="h-10 rounded-t-xl rounded-b-none" />
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
