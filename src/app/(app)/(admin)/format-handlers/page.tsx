"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Blocks, Search, FlaskConical, AlertCircle, RotateCcw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import formatHandlersApi, {
  type FormatHandler,
  type FormatTestResult,
} from "@/lib/api/format-handlers";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const QUERY_KEY = ["format-handlers"];

export default function FormatHandlersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [testTarget, setTestTarget] = useState<FormatHandler | null>(null);
  const [testPath, setTestPath] = useState("");
  const [testContent, setTestContent] = useState("");
  const [testResult, setTestResult] = useState<FormatTestResult | null>(null);

  const { data: handlers, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => formatHandlersApi.list(),
    enabled: !!user?.is_admin,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      formatHandlersApi.setEnabled(vars.key, vars.enabled),
    onSuccess: (h) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(`${h.display_name} ${h.is_enabled ? "enabled" : "disabled"}`);
    },
    onError: mutationErrorToast("Failed to toggle format handler"),
  });

  const testMutation = useMutation({
    mutationFn: (vars: { key: string; path: string; content: string }) =>
      formatHandlersApi.test(vars.key, { path: vars.path, content: vars.content }),
    onSuccess: (res) => setTestResult(res),
    onError: mutationErrorToast("Format test failed"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = handlers ?? [];
    if (!q) return all;
    return all.filter(
      (h) =>
        h.format_key.toLowerCase().includes(q) ||
        h.display_name.toLowerCase().includes(q) ||
        h.extensions.some((e) => e.toLowerCase().includes(q)),
    );
  }, [handlers, search]);

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Blocks className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">Format handler management requires administrator access.</p>
      </div>
    );
  }

  function openTest(h: FormatHandler) {
    setTestTarget(h);
    setTestPath("");
    setTestContent("");
    setTestResult(null);
  }
  const canRunTest = testPath.trim() !== "" && testContent !== "" && !testMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Blocks className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Format Handlers</h1>
          <p className="text-sm text-muted-foreground">
            Enable, disable, and test the package-format handlers (built-in and WASM plugins).
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filter by format, name, or extension…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter handlers" />
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load format handlers</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {search ? "No handlers match your filter." : "No format handlers found."}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="divide-y rounded-md border">
          {filtered.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={h.is_enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ key: h.format_key, enabled: v })}
                  aria-label={`Enable ${h.display_name}`}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{h.display_name}</span>
                    <Badge variant="outline" className="font-mono">{h.format_key}</Badge>
                    <Badge variant={h.handler_type === "Wasm" ? "secondary" : "outline"}>{h.handler_type}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.extensions.length > 0 ? h.extensions.join(", ") : "no extensions"} · priority {h.priority}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Test ${h.display_name}`} onClick={() => openTest(h)}>
                <FlaskConical className="size-4" /> Test
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Test dialog */}
      <Dialog open={testTarget !== null} onOpenChange={(o) => !o && setTestTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test {testTarget?.display_name}</DialogTitle>
            <DialogDescription>
              Dry-run the handler against sample content — checks parsing without storing anything.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="fh-path">Artifact path</Label>
              <Input id="fh-path" value={testPath} onChange={(e) => setTestPath(e.target.value)} placeholder="acme/acme-1.0.0.whl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fh-content">Content</Label>
              <Textarea id="fh-content" rows={6} value={testContent} onChange={(e) => setTestContent(e.target.value)} placeholder="Paste artifact content or metadata…" />
            </div>
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${testResult.valid ? "border-emerald-500/40 text-emerald-600" : "border-destructive/40 text-destructive"}`}
                role="status"
              >
                {testResult.valid ? <CheckCircle2 className="size-4 mt-0.5" /> : <XCircle className="size-4 mt-0.5" />}
                <span>{testResult.valid ? "Valid — the handler parsed this content." : testResult.parse_error || "Invalid content."}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestTarget(null)}>Close</Button>
            <Button
              disabled={!canRunTest}
              onClick={() => testTarget && testMutation.mutate({ key: testTarget.format_key, path: testPath.trim(), content: testContent })}
            >
              {testMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
              Run test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
