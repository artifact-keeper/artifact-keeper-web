import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { SearchContent } from "./_components/search-content";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
