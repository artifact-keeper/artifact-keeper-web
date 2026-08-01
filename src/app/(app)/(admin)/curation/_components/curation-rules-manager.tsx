"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  TrendingDown,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

import {
  curationRulesApi,
  type CurationRule,
  type CreateRuleRequest,
  type RuleType,
  RULE_ACTIONS,
  RULE_TYPES,
  PUBLISHER_MATCHES,
  parseList,
  clampDistance,
} from "@/lib/api/curation-rules";
import { useRepositories } from "@/hooks/use-repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const QUERY_KEY = ["curation-rules"];

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  pattern: "Pattern",
  publisher_trust: "Publisher trust",
  popularity: "Popularity",
};

const RULE_TYPE_ICONS: Record<RuleType, typeof Filter> = {
  pattern: Filter,
  publisher_trust: ShieldCheck,
  popularity: TrendingDown,
};

// ---------------------------------------------------------------------------
// Form state — one flat object covering every engine's fields. `toRequest`
// projects only the fields relevant to the selected `rule_type` into `config`.
// ---------------------------------------------------------------------------

interface RuleFormState {
  rule_type: RuleType;
  scope: "repository" | "global";
  staging_repo_id: string; // "" => omitted
  package_pattern: string;
  version_constraint: string;
  architecture: string;
  action: string;
  priority: number;
  reason: string;
  enabled: boolean;
  // publisher_trust
  trusted_publishers: string; // comma/newline separated
  pt_match: string;
  pt_action: string;
  // popularity
  min_downloads: number | undefined;
  max_distance: number;
  typosquat_check: boolean;
  homoglyph_check: boolean;
  affix_check: boolean;
  affix_max_downloads: number | undefined;
  pop_action: string;
  popular_packages: string; // comma/newline separated
}

const emptyForm: RuleFormState = {
  rule_type: "pattern",
  scope: "repository",
  staging_repo_id: "",
  package_pattern: "*",
  version_constraint: "*",
  architecture: "*",
  action: "flag",
  priority: 100,
  reason: "",
  enabled: true,
  trusted_publishers: "",
  pt_match: "attestation",
  pt_action: "flag",
  min_downloads: undefined,
  max_distance: 2,
  typosquat_check: true,
  homoglyph_check: false,
  affix_check: false,
  affix_max_downloads: 1000,
  pop_action: "flag",
  popular_packages: "",
};

function buildConfig(f: RuleFormState): Record<string, unknown> {
  if (f.rule_type === "publisher_trust") {
    return {
      trusted_publishers: parseList(f.trusted_publishers),
      match: f.pt_match,
      action: f.pt_action,
    };
  }
  if (f.rule_type === "popularity") {
    const config: Record<string, unknown> = {
      typosquat_check: f.typosquat_check,
      action: f.pop_action,
    };
    if (f.min_downloads != null) config.min_downloads = f.min_downloads;
    if (f.typosquat_check) {
      config.max_distance = clampDistance(f.max_distance);
      config.homoglyph_check = f.homoglyph_check;
      config.affix_check = f.affix_check;
      if (f.affix_check) {
        config.affix_max_downloads = f.affix_max_downloads ?? 1000;
      }
    }
    const popular = parseList(f.popular_packages);
    if (popular.length > 0) config.popular_packages = popular;
    return config;
  }
  // pattern: no engine-specific config
  return {};
}

export function toRequest(f: RuleFormState): CreateRuleRequest {
  return {
    rule_type: f.rule_type,
    scope: f.scope,
    staging_repo_id:
      f.scope === "global" || f.staging_repo_id === ""
        ? null
        : f.staging_repo_id,
    package_pattern: f.package_pattern.trim() || "*",
    version_constraint: f.version_constraint.trim() || "*",
    architecture: f.architecture.trim() || "*",
    action: f.action,
    priority: f.priority,
    reason: f.reason.trim(),
    enabled: f.enabled,
    config: buildConfig(f),
  };
}

function formFromRule(r: CurationRule): RuleFormState {
  const c = r.config ?? {};
  const asList = (v: unknown): string =>
    Array.isArray(v) ? (v as unknown[]).map(String).join(", ") : "";
  const asNum = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
  const asBool = (v: unknown, dflt: boolean): boolean =>
    typeof v === "boolean" ? v : dflt;
  return {
    rule_type: r.rule_type,
    scope: r.scope,
    staging_repo_id: r.staging_repo_id ?? "",
    package_pattern: r.package_pattern,
    version_constraint: r.version_constraint,
    architecture: r.architecture,
    action: r.action,
    priority: r.priority,
    reason: r.reason ?? "",
    enabled: r.enabled,
    trusted_publishers: asList(c.trusted_publishers),
    pt_match: typeof c.match === "string" ? c.match : "attestation",
    pt_action:
      r.rule_type === "publisher_trust" && typeof c.action === "string"
        ? c.action
        : "flag",
    min_downloads: asNum(c.min_downloads),
    max_distance: clampDistance(asNum(c.max_distance)),
    typosquat_check: asBool(c.typosquat_check, true),
    homoglyph_check: asBool(c.homoglyph_check, false),
    affix_check: asBool(c.affix_check, false),
    affix_max_downloads: asNum(c.affix_max_downloads) ?? 1000,
    pop_action:
      r.rule_type === "popularity" && typeof c.action === "string"
        ? c.action
        : "flag",
    popular_packages: asList(c.popular_packages),
  };
}

function numField(v: string): number | undefined {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function CurationRulesManager() {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CurationRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CurationRule | null>(null);

  const { data: rules, isLoading, isError, error, refetch, isFetching } =
    useQuery({
      queryKey: QUERY_KEY,
      queryFn: () => curationRulesApi.list(),
    });

  const { data: repos } = useRepositories({ per_page: 1000 });
  const stagingRepos = useMemo(
    () => (repos?.items ?? []).filter((r) => r.repo_type === "staging"),
    [repos?.items],
  );
  const repoKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of repos?.items ?? []) map.set(r.id, r.key);
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : null);
  }, [repos?.items]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; form: RuleFormState }) => {
      const req = toRequest(vars.form);
      return vars.id
        ? curationRulesApi.update(vars.id, req)
        : curationRulesApi.create(req);
    },
    onSuccess: (_r, vars) => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(vars.id ? "Rule updated" : "Rule created");
    },
    onError: mutationErrorToast("Failed to save rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => curationRulesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("Rule deleted");
    },
    onError: mutationErrorToast("Failed to delete rule"),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(r: CurationRule) {
    setEditing(r);
    setForm(formFromRule(r));
    setDialogOpen(true);
  }

  const canSave =
    !saveMutation.isPending &&
    (form.rule_type !== "publisher_trust" ||
      parseList(form.trusted_publishers).length > 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({ id: editing?.id ?? null, form });
  }

  const rows = rules ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Standing policy the curation queue is evaluated against: pattern,
          publisher-trust, and popularity (typo-squat) gates.
        </p>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New Rule
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          role="alert"
        >
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load curation rules</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {toUserMessage(error, "Unknown error")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <ShieldCheck className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No curation rules yet.</p>
          <p className="text-xs">
            Create one to gate proxied packages by pattern, publisher trust, or
            popularity.
          </p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Pattern</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const Icon = RULE_TYPE_ICONS[r.rule_type];
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-4 text-muted-foreground" />
                        {RULE_TYPE_LABELS[r.rule_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.package_pattern}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="capitalize">
                        {r.scope === "global"
                          ? "global"
                          : repoKey(r.staging_repo_id) ?? "repository"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          r.action === "block" ? "destructive" : "secondary"
                        }
                        className="capitalize"
                      >
                        {r.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.priority}</td>
                    <td className="px-3 py-2">
                      {r.enabled ? (
                        <Badge variant="secondary">enabled</Badge>
                      ) : (
                        <Badge variant="outline">disabled</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${r.rule_type} rule ${r.package_pattern}`}
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${r.rule_type} rule ${r.package_pattern}`}
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit curation rule" : "New curation rule"}
              </DialogTitle>
              <DialogDescription>
                Rules are evaluated in priority order over packages entering the
                curation queue.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Rule type */}
              <div className="space-y-1.5">
                <Label htmlFor="cr-type">Rule type</Label>
                <Select
                  value={form.rule_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, rule_type: v as RuleType }))
                  }
                >
                  <SelectTrigger id="cr-type" aria-label="Rule type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {RULE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Common: scope + repo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cr-scope">Scope</Label>
                  <Select
                    value={form.scope}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        scope: v as "repository" | "global",
                      }))
                    }
                  >
                    <SelectTrigger id="cr-scope" aria-label="Scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="repository">Repository</SelectItem>
                      <SelectItem value="global">Global</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cr-repo">Staging repository</Label>
                  <Select
                    value={form.staging_repo_id}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, staging_repo_id: v }))
                    }
                  >
                    <SelectTrigger
                      id="cr-repo"
                      aria-label="Staging repository"
                      disabled={form.scope === "global"}
                    >
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {stagingRepos.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Common: pattern / version / arch */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cr-pattern">Package pattern</Label>
                  <Input
                    id="cr-pattern"
                    value={form.package_pattern}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, package_pattern: e.target.value }))
                    }
                    placeholder="*"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cr-version">Version</Label>
                  <Input
                    id="cr-version"
                    value={form.version_constraint}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        version_constraint: e.target.value,
                      }))
                    }
                    placeholder="*"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cr-arch">Architecture</Label>
                  <Input
                    id="cr-arch"
                    value={form.architecture}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, architecture: e.target.value }))
                    }
                    placeholder="*"
                  />
                </div>
              </div>

              {/* Common: action + priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cr-action">Action</Label>
                  <Select
                    value={form.action}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, action: v }))
                    }
                  >
                    <SelectTrigger id="cr-action" aria-label="Action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_ACTIONS.map((a) => (
                        <SelectItem key={a} value={a} className="capitalize">
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cr-priority">Priority</Label>
                  <Input
                    id="cr-priority"
                    type="number"
                    min={0}
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        priority: numField(e.target.value) ?? 100,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Engine-specific config sub-form */}
              {form.rule_type === "publisher_trust" && (
                <div className="space-y-4 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Publisher-trust configuration
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="cr-pt-publishers">
                      Trusted publishers (one per line or comma-separated)
                    </Label>
                    <Textarea
                      id="cr-pt-publishers"
                      value={form.trusted_publishers}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          trusted_publishers: e.target.value,
                        }))
                      }
                      placeholder={"github.com/acme\nnpmjs.com/@acme"}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cr-pt-match">Match</Label>
                      <Select
                        value={form.pt_match}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, pt_match: v }))
                        }
                      >
                        <SelectTrigger id="cr-pt-match" aria-label="Match">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PUBLISHER_MATCHES.map((m) => (
                            <SelectItem
                              key={m}
                              value={m}
                              className="capitalize"
                            >
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cr-pt-action">Untrusted action</Label>
                      <Select
                        value={form.pt_action}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, pt_action: v }))
                        }
                      >
                        <SelectTrigger
                          id="cr-pt-action"
                          aria-label="Untrusted action"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["flag", "block", "allow", "audit"] as const).map(
                            (a) => (
                              <SelectItem
                                key={a}
                                value={a}
                                className="capitalize"
                              >
                                {a}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {form.rule_type === "popularity" && (
                <div className="space-y-4 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Popularity configuration
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cr-pop-min">Min downloads</Label>
                      <Input
                        id="cr-pop-min"
                        type="number"
                        min={0}
                        value={form.min_downloads ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            min_downloads: numField(e.target.value),
                          }))
                        }
                        placeholder="e.g. 1000"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cr-pop-action">Flagged action</Label>
                      <Select
                        value={form.pop_action}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, pop_action: v }))
                        }
                      >
                        <SelectTrigger
                          id="cr-pop-action"
                          aria-label="Flagged action"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["flag", "block"] as const).map((a) => (
                            <SelectItem
                              key={a}
                              value={a}
                              className="capitalize"
                            >
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="cr-pop-typo">Typo-squat check</Label>
                    <Switch
                      id="cr-pop-typo"
                      checked={form.typosquat_check}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, typosquat_check: v }))
                      }
                    />
                  </div>

                  {form.typosquat_check && (
                    <div className="space-y-4 border-l-2 pl-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="cr-pop-distance">
                          Max edit distance (1–2)
                        </Label>
                        <Input
                          id="cr-pop-distance"
                          type="number"
                          min={1}
                          max={2}
                          value={form.max_distance}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              max_distance: clampDistance(
                                numField(e.target.value),
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <Label htmlFor="cr-pop-homoglyph">
                          Homoglyph check
                        </Label>
                        <Switch
                          id="cr-pop-homoglyph"
                          checked={form.homoglyph_check}
                          onCheckedChange={(v) =>
                            setForm((f) => ({ ...f, homoglyph_check: v }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <Label htmlFor="cr-pop-affix">Affix check</Label>
                        <Switch
                          id="cr-pop-affix"
                          checked={form.affix_check}
                          onCheckedChange={(v) =>
                            setForm((f) => ({ ...f, affix_check: v }))
                          }
                        />
                      </div>
                      {form.affix_check && (
                        <div className="space-y-1.5">
                          <Label htmlFor="cr-pop-affix-max">
                            Affix max downloads
                          </Label>
                          <Input
                            id="cr-pop-affix-max"
                            type="number"
                            min={0}
                            value={form.affix_max_downloads ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                affix_max_downloads: numField(e.target.value),
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="cr-pop-packages">
                      Popular packages (optional; one per line or comma-separated)
                    </Label>
                    <Textarea
                      id="cr-pop-packages"
                      value={form.popular_packages}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          popular_packages: e.target.value,
                        }))
                      }
                      placeholder={"react\nlodash\nexpress"}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Common: reason + enabled */}
              <div className="space-y-1.5">
                <Label htmlFor="cr-reason">Reason</Label>
                <Input
                  id="cr-reason"
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  placeholder="Why this rule exists (recorded on matches)"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="cr-enabled">Enabled</Label>
                <Switch
                  id="cr-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, enabled: v }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete curation rule?"
        description={`This ${
          deleteTarget?.rule_type ?? ""
        } rule will be permanently deleted. The curation queue stops applying it.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

export default CurationRulesManager;
