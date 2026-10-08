"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  allowlistQueryKey,
  condaAllowlistApi,
  type CondaAllowlist,
} from "@/lib/api/conda-allowlist";
import { apiErrorMessage } from "@/lib/api/fetch";
import {
  ALLOWLIST_LIMITS,
  backendEntryIndex,
  mergeAllowlistEntries,
  normalizeAllowlistEntry,
  parseAllowlistLines,
  parseLockfile,
  splitSubdirs,
  validateAllowlistEntry,
  type AllowlistEntry,
  type LineError,
  type LockfileImport,
} from "@/lib/conda-allowlist";
import { toUserMessage } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One editable row. Fields are kept as typed; `subdirs` is comma-separated. */
interface Row {
  id: number;
  name: string;
  version: string;
  subdirs: string;
}

/** Rows rendered at once; a channel list can hold 10,000 entries. */
const PAGE = 100;

export const EMPTY_ENABLED_WARNING =
  "An enabled empty list admits nothing from remote members; hosted members are never filtered.";

let nextRowId = 1;
function toRow(e: AllowlistEntry): Row {
  return {
    id: nextRowId++,
    name: e.name,
    version: e.version ?? "",
    subdirs: (e.subdirs ?? []).join(", "),
  };
}

function toEntry(r: Row): AllowlistEntry {
  return normalizeAllowlistEntry({
    name: r.name,
    version: r.version,
    subdirs: splitSubdirs(r.subdirs),
  });
}

function sameList(enabled: boolean, rows: Row[], server: CondaAllowlist | undefined): boolean {
  if (!server) return true;
  if (enabled !== server.enabled || rows.length !== server.entries.length) return false;
  return JSON.stringify(rows.map(toEntry)) ===
    JSON.stringify(server.entries.map(normalizeAllowlistEntry));
}

function subdirSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");
}

interface CondaAllowlistSettingsProps {
  repository: Repository;
  /** Show the list without controls (users who can see it but not change it). */
  readOnly?: boolean;
}

/**
 * The package allowlist of a virtual conda repository (#971, backend
 * artifact-keeper#4576). It restricts what the virtual's REMOTE members
 * contribute to its repodata, channeldata and downloads; hosted members are
 * never filtered. The backend replaces the whole list on each `PUT`, so edits
 * here are local until "Save allowlist".
 */
export function CondaAllowlistSettings({ repository, readOnly = false }: CondaAllowlistSettingsProps) {
  const queryClient = useQueryClient();
  const queryKey = allowlistQueryKey(repository.key);
  const { data, isLoading, error: loadError } = useQuery({
    queryKey,
    queryFn: () => condaAllowlistApi.get(repository.key),
    retry: false,
  });

  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [synced, setSynced] = useState<CondaAllowlist | null>(null);
  const dirty = synced !== null && !sameList(enabled, rows, synced);
  // Adopt fresh server data unless there are unsaved edits (the routing-rules
  // pattern: adjust state during render, never clobber local edits).
  if (data && data !== synced && !dirty) {
    setSynced(data);
    setEnabled(data.enabled);
    setRows(data.entries.map(toRow));
  }

  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [draft, setDraft] = useState({ name: "", version: "", subdirs: "" });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteErrors, setPasteErrors] = useState<LineError[]>([]);
  const [pendingImport, setPendingImport] = useState<(LockfileImport & { file: string }) | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverError, setServerError] = useState<{ message: string; index: number | null; rowId?: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const rowErrors = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) {
      const problem = validateAllowlistEntry(toEntry(r));
      if (problem) m.set(r.id, problem);
    }
    return m;
  }, [rows]);
  const tooMany = rows.length > ALLOWLIST_LIMITS.maxEntries;
  const invalid = rowErrors.size > 0 || tooMany;

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => !f || r.name.toLowerCase().includes(f));
  }, [rows, filter]);

  const applyResponse = (resp: CondaAllowlist) => {
    queryClient.setQueryData(queryKey, resp);
    setSynced(resp);
    setEnabled(resp.enabled);
    setRows(resp.entries.map(toRow));
    setServerError(null);
  };

  const save = useMutation({
    mutationFn: () =>
      condaAllowlistApi.set(repository.key, { enabled, entries: rows.map(toEntry) }),
    onSuccess: (resp) => {
      applyResponse(resp);
      toast.success(`Allowlist saved: ${resp.enabled ? "on" : "off"}, ${resp.entry_count} entries`);
    },
    onError: (err) => {
      const message = apiErrorMessage(err) ?? toUserMessage(err, "Failed to save the allowlist");
      const index = backendEntryIndex(message);
      setServerError({ message, index, rowId: index === null ? undefined : rows[index]?.id });
    },
  });

  const remove = useMutation({
    mutationFn: () => condaAllowlistApi.remove(repository.key),
    onSuccess: (resp) => {
      applyResponse(resp);
      setConfirmRemove(false);
      toast.success("Allowlist removed");
    },
    onError: (err) => {
      setConfirmRemove(false);
      setServerError({
        message: apiErrorMessage(err) ?? toUserMessage(err, "Failed to remove the allowlist"),
        index: null,
      });
    },
  });
  const busy = save.isPending || remove.isPending;

  const edit = (id: number, field: keyof Omit<Row, "id">, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    if (serverError?.rowId === id) setServerError(null);
  };

  const mergeIn = (incoming: AllowlistEntry[], replace = false) => {
    if (replace) {
      setRows(incoming.map(toRow));
      setNotice(`List replaced with ${incoming.length} entries. Save to apply.`);
      return;
    }
    const { entries, added, updated } = mergeAllowlistEntries(rows.map(toEntry), incoming);
    // Keep existing rows (and their in-progress text) and append the new ones.
    const next = rows.map((r, i) => {
      const e = entries[i];
      return (e.subdirs ?? []).join(", ") === splitSubdirs(r.subdirs).join(", ")
        ? r
        : { ...r, subdirs: (e.subdirs ?? []).join(", ") };
    });
    setRows([...next, ...entries.slice(rows.length).map(toRow)]);
    setNotice(
      `${added} ${added === 1 ? "entry" : "entries"} added` +
        (updated ? `, ${updated} widened to more subdirs` : "") +
        ". Save to apply.",
    );
  };

  const addDraft = () => {
    const entry = normalizeAllowlistEntry({
      name: draft.name,
      version: draft.version,
      subdirs: splitSubdirs(draft.subdirs),
    });
    const problem = validateAllowlistEntry(entry);
    if (problem) {
      setDraftError(problem);
      return;
    }
    setDraftError(null);
    setRows((prev) => [toRow(entry), ...prev]);
    setDraft({ name: "", version: "", subdirs: "" });
    setNotice(null);
  };

  const addPasted = () => {
    const { entries, errors } = parseAllowlistLines(paste);
    setPasteErrors(errors);
    if (errors.length > 0) return;
    if (entries.length === 0) {
      setPasteErrors([{ line: 0, message: "No entries in the pasted text." }]);
      return;
    }
    mergeIn(entries);
    setPaste("");
  };

  const readLockfile = async (file: File | undefined) => {
    setPendingImport(null);
    setImportError(null);
    if (!file) return;
    const result = parseLockfile(await file.text(), file.name);
    if (!result) {
      setImportError(`${file.name} is not a pixi.lock or conda-lock.yml file.`);
    } else if (result.entries.length === 0) {
      setImportError(`${file.name} locks no conda packages.`);
    } else {
      setPendingImport({ ...result, file: file.name });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const heading = (
    <div className="flex items-center gap-2 mb-2">
      <ListChecks className="size-4 text-muted-foreground" />
      <h3 id="settings-allowlist-heading" className="text-base font-semibold">
        Allowlist
      </h3>
      {data && (
        <Badge variant={data.enabled ? "default" : "secondary"} data-testid="allowlist-state">
          {data.enabled ? "On" : "Off"}
        </Badge>
      )}
    </div>
  );
  const intro = (
    <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
      Restrict what this channel takes from its remote members to an approved
      set of packages. A remote package the list does not admit is left out of
      the channel&apos;s repodata and channeldata, and its download answers 404.
      Hosted members are never filtered. Names are exact or{" "}
      <code className="font-mono">*</code>/<code className="font-mono">?</code>{" "}
      globs (case-insensitive); versions are conda match specs such as{" "}
      <code className="font-mono">2.2.3</code>, <code className="font-mono">2.2.*</code> or{" "}
      <code className="font-mono">&gt;=2,&lt;3</code>; empty subdirs mean every platform.
    </p>
  );

  if (isLoading) {
    return (
      <section id="settings-allowlist" aria-labelledby="settings-allowlist-heading">
        {heading}
        {intro}
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    );
  }

  if (loadError || !data) {
    return (
      <section id="settings-allowlist" aria-labelledby="settings-allowlist-heading">
        {heading}
        {intro}
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The allowlist could not be loaded</AlertTitle>
          <AlertDescription>
            {apiErrorMessage(loadError) ?? toUserMessage(loadError, "Unknown error")}
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const storedError = data.error ? (
    <Alert variant="destructive" data-testid="allowlist-stored-error">
      <AlertTriangle />
      <AlertTitle>The stored allowlist cannot be read</AlertTitle>
      <AlertDescription>
        Nothing from remote members is admitted until a valid list is saved
        or the list is removed. The server reports:{" "}
        <span className="font-mono">{data.error}</span>
      </AlertDescription>
    </Alert>
  ) : null;

  const visible = shown.slice(0, limit);

  const table =
    rows.length === 0 ? (
      <div className="rounded-md border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">No entries.</p>
      </div>
    ) : (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Filter entries by name"
            placeholder="Filter by name"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
            className="h-8 max-w-xs text-sm"
          />
          <span className="text-xs text-muted-foreground" data-testid="allowlist-count">
            {filter.trim()
              ? `${shown.length} of ${rows.length} entries`
              : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
          </span>
        </div>
        <Table aria-label="Allowlist entries">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Subdirs</TableHead>
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ r, index }) => {
              const problem =
                rowErrors.get(r.id) ?? (serverError?.rowId === r.id ? serverError.message : undefined);
              const n = index + 1;
              return (
                <TableRow key={r.id} data-invalid={problem ? "true" : undefined}>
                  <TableCell className="align-top text-muted-foreground tabular-nums pt-3">{n}</TableCell>
                  {readOnly ? (
                    <>
                      <TableCell className="font-mono text-xs">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.version || <span className="text-muted-foreground">any</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.subdirs || <span className="text-muted-foreground">all</span>}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="align-top">
                        <Input
                          aria-label={`Entry ${n} name`}
                          value={r.name}
                          onChange={(e) => edit(r.id, "name", e.target.value)}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem ? `allowlist-row-${r.id}-error` : undefined}
                          className="h-8 font-mono text-xs"
                        />
                        {problem && (
                          <p id={`allowlist-row-${r.id}-error`} className="mt-1 text-xs text-destructive">
                            {problem}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          aria-label={`Entry ${n} version`}
                          value={r.version}
                          placeholder="any"
                          onChange={(e) => edit(r.id, "version", e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          aria-label={`Entry ${n} subdirs`}
                          value={r.subdirs}
                          placeholder="all"
                          onChange={(e) => edit(r.id, "subdirs", e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="mt-1 text-destructive hover:text-destructive"
                          onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                          disabled={busy}
                          aria-label={`Remove entry ${n}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {shown.length > visible.length && (
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, shown.length - visible.length)} more ({shown.length - visible.length} hidden)
          </Button>
        )}
      </>
    );

  if (readOnly) {
    return (
      <section id="settings-allowlist" aria-labelledby="settings-allowlist-heading" className="space-y-4">
        <div>
          {heading}
          {intro}
        </div>
        {storedError}
        <p className="text-sm">
          The allowlist is <strong>{data.enabled ? "enforced" : "not enforced"}</strong>. Only a
          repository administrator can change it.
        </p>
        {table}
      </section>
    );
  }

  return (
    <section id="settings-allowlist" aria-labelledby="settings-allowlist-heading" className="space-y-4">
      <div>
        {heading}
        {intro}
      </div>
      {storedError}

      <div className="flex items-center gap-3">
        <Switch
          id="allowlist-enabled"
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v)}
          disabled={busy}
        />
        <Label htmlFor="allowlist-enabled">Enforce the allowlist</Label>
      </div>
      {enabled && rows.length === 0 && (
        <Alert data-testid="allowlist-empty-warning">
          <AlertTriangle />
          <AlertTitle>The list is empty</AlertTitle>
          <AlertDescription>{EMPTY_ENABLED_WARNING}</AlertDescription>
        </Alert>
      )}

      {table}

      {tooMany && (
        <p role="alert" className="text-sm text-destructive">
          {rows.length} entries; at most {ALLOWLIST_LIMITS.maxEntries.toLocaleString()} are allowed.
        </p>
      )}
      {rowErrors.size > 0 && (
        <p role="alert" className="text-sm text-destructive">
          {rowErrors.size} {rowErrors.size === 1 ? "entry needs" : "entries need"} fixing before the
          list can be saved.
        </p>
      )}
      {serverError && (
        <Alert variant="destructive" data-testid="allowlist-server-error">
          <AlertTriangle />
          <AlertTitle>
            {serverError.index !== null && rows[serverError.index]
              ? `The server refused entry ${serverError.index + 1} (${rows[serverError.index].name})`
              : "The server refused the allowlist"}
          </AlertTitle>
          <AlertDescription>{serverError.message}</AlertDescription>
        </Alert>
      )}
      {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || invalid || busy}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save allowlist
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || busy}
          onClick={() => {
            setEnabled(data.enabled);
            setRows(data.entries.map(toRow));
            setServerError(null);
            setNotice(null);
          }}
        >
          Discard changes
        </Button>
        {(data.enabled || data.entry_count > 0 || data.error) && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            Remove allowlist
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Lockfile import */}
        <div className="rounded-md border p-4 space-y-3">
          <Label htmlFor="allowlist-lockfile" className="text-sm font-medium">
            Import from pixi.lock / conda-lock
          </Label>
          <p className="text-xs text-muted-foreground">
            The lockfile is the allowlist: every conda package it locks becomes
            an entry with its exact version and subdirs. Read in the browser;
            nothing is uploaded until you save.
          </p>
          <Input
            id="allowlist-lockfile"
            ref={fileInput}
            type="file"
            accept=".lock,.yml,.yaml"
            onChange={(e) => void readLockfile(e.target.files?.[0])}
            className="h-9 text-xs"
          />
          {importError && (
            <p role="alert" className="text-xs text-destructive">{importError}</p>
          )}
          {pendingImport && (
            <div className="space-y-2" data-testid="allowlist-import-preview">
              <p className="text-sm">
                <strong>{pendingImport.entries.length}</strong> entries from{" "}
                {pendingImport.packages} conda packages in{" "}
                <span className="font-mono">{pendingImport.file}</span>
                {Object.keys(pendingImport.subdirCounts).length > 0 && (
                  <span className="text-muted-foreground"> ({subdirSummary(pendingImport.subdirCounts)})</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    mergeIn(pendingImport.entries);
                    setPendingImport(null);
                  }}
                >
                  <FileUp className="size-4" />
                  Add to list
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    mergeIn(pendingImport.entries, true);
                    setPendingImport(null);
                  }}
                >
                  Replace list
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {/* Bulk paste */}
        <div className="rounded-md border p-4 space-y-3">
          <Label htmlFor="allowlist-paste" className="text-sm font-medium">Paste entries</Label>
          <p className="text-xs text-muted-foreground">
            One <code className="font-mono">name [version] [subdir,subdir]</code> per line; use{" "}
            <code className="font-mono">*</code> for any version. Lines starting with{" "}
            <code className="font-mono">#</code> are ignored.
          </p>
          <Textarea
            id="allowlist-paste"
            rows={4}
            value={paste}
            placeholder={"numpy 2.2.3 linux-64\npandas >=2,<3\nlibblas * linux-64,osx-arm64"}
            onChange={(e) => {
              setPaste(e.target.value);
              setPasteErrors([]);
            }}
            className="font-mono text-xs"
            aria-describedby="allowlist-paste-errors"
          />
          <ul id="allowlist-paste-errors" role="alert" className="space-y-0.5 text-xs text-destructive">
            {pasteErrors.slice(0, 5).map((e) => (
              <li key={e.line}>{e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message}</li>
            ))}
            {pasteErrors.length > 5 && <li>and {pasteErrors.length - 5} more lines</li>}
          </ul>
          <Button size="sm" variant="outline" onClick={addPasted} disabled={!paste.trim()}>
            Add lines
          </Button>
        </div>

        {/* Add one entry */}
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">Add an entry</p>
          <div className="space-y-1.5">
            <Label htmlFor="allowlist-new-name" className="text-xs">Name</Label>
            <Input
              id="allowlist-new-name"
              value={draft.name}
              placeholder="numpy"
              onChange={(e) => {
                setDraft((d) => ({ ...d, name: e.target.value }));
                setDraftError(null);
              }}
              aria-invalid={draftError ? true : undefined}
              aria-describedby="allowlist-new-error"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="allowlist-new-version" className="text-xs">Version</Label>
              <Input
                id="allowlist-new-version"
                value={draft.version}
                placeholder=">=2,<3"
                onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allowlist-new-subdirs" className="text-xs">Subdirs</Label>
              <Input
                id="allowlist-new-subdirs"
                value={draft.subdirs}
                placeholder="linux-64, noarch"
                onChange={(e) => setDraft((d) => ({ ...d, subdirs: e.target.value }))}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
          <p id="allowlist-new-error" role="alert" className="min-h-[1rem] text-xs text-destructive">
            {draftError}
          </p>
          <Button size="sm" variant="outline" onClick={addDraft} disabled={!draft.name.trim()}>
            <Plus className="size-4" />
            Add entry
          </Button>
        </div>

      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the allowlist?"
        description={`${repository.key} will take every package its remote members offer again. The ${data.entry_count} entries are deleted.`}
        confirmText="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </section>
  );
}
