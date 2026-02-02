"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Database,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { searchApi, type SearchResult } from "@/lib/api/search";

interface QuickSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickSearch({ open, onOpenChange }: QuickSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchApi.quickSearch({ query, limit: 15 });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setIsLoading(false);
    }
  }, [open]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      if (result.type === "repository") {
        router.push(`/repositories/${result.repository_key}`);
      } else if (result.type === "package") {
        router.push(`/packages?selected=${result.id}`);
      } else {
        router.push(
          `/repositories/${result.repository_key}?path=${encodeURIComponent(result.path || "")}`
        );
      }
    },
    [router, onOpenChange]
  );

  const handleSearchMore = useCallback(() => {
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(query)}&tab=package`);
  }, [router, onOpenChange, query]);

  // Group results by type
  const repositories = results.filter((r) => r.type === "repository");
  const packages = results.filter((r) => r.type === "package");
  const artifacts = results.filter((r) => r.type === "artifact");

  const typeIcon = (type: string) => {
    switch (type) {
      case "repository":
        return <Database className="size-4 text-muted-foreground" />;
      case "package":
        return <Package className="size-4 text-muted-foreground" />;
      default:
        return <FileText className="size-4 text-muted-foreground" />;
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick Search"
      description="Search for repositories, packages, and artifacts"
    >
      <CommandInput
        placeholder="Search repositories, packages, artifacts..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
        )}

        {!isLoading && query.length < 2 && (
          <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
        )}

        {repositories.length > 0 && (
          <CommandGroup heading="Repositories">
            {repositories.map((result) => (
              <CommandItem
                key={`repo-${result.id}`}
                value={`repo-${result.name}`}
                onSelect={() => handleSelect(result)}
              >
                {typeIcon(result.type)}
                <span className="flex-1 truncate">{result.name}</span>
                {result.format && (
                  <Badge variant="secondary" className="text-xs">
                    {result.format}
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {packages.length > 0 && (
          <>
            {repositories.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Packages">
              {packages.map((result) => (
                <CommandItem
                  key={`pkg-${result.id}`}
                  value={`pkg-${result.name}`}
                  onSelect={() => handleSelect(result)}
                >
                  {typeIcon(result.type)}
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <span className="truncate">{result.name}</span>
                    {result.version && (
                      <span className="text-xs text-muted-foreground">
                        {result.version}
                      </span>
                    )}
                  </div>
                  {result.format && (
                    <Badge variant="secondary" className="text-xs">
                      {result.format}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {artifacts.length > 0 && (
          <>
            {(repositories.length > 0 || packages.length > 0) && (
              <CommandSeparator />
            )}
            <CommandGroup heading="Artifacts">
              {artifacts.map((result) => (
                <CommandItem
                  key={`art-${result.id}`}
                  value={`art-${result.name}`}
                  onSelect={() => handleSelect(result)}
                >
                  {typeIcon(result.type)}
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="truncate text-sm">{result.name}</span>
                    {result.path && (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.repository_key}/{result.path}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {query.length >= 2 && results.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={handleSearchMore}>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span>Search for more results...</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
