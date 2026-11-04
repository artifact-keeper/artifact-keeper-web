"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Info, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/common/copy-button";
import { McpNoRunnerAlert } from "@/components/mcp/runner-list";
import { mcpApi } from "@/lib/api/mcp";
import {
  MCP_CLIENTS,
  buildClientSnippets,
  placeholderName,
  type McpClientId,
  type McpSnippet,
} from "@/lib/mcp/client-configs";
import { mcpRegistryBaseUrl } from "@/lib/mcp/format";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { inputsOf, officialMeta, runnerLabel, runnersOf, type McpRunner } from "@/lib/mcp/server-json";
import type { McpInput, McpServedEntry } from "@/types/mcp";

export interface McpInstallPanelProps {
  repoKey: string;
  entry: McpServedEntry;
  versions?: McpServedEntry[];
  onVersionChange?: (version: string) => void;
}

/** A field the user may fill in: the input, keyed by the name snippets read. */
interface ConfigField {
  key: string;
  input: McpInput;
}

/**
 * The inputs of a runner the user supplies a value for. A fixed `value` is
 * not editable, but its `{var}` references are, so those surface as fields
 * named after the variable (the key `client-configs` reads them by).
 */
export function configFieldsOf(runner: McpRunner): ConfigField[] {
  const inputs = runner.kind === "package" ? inputsOf(runner.pkg) : (runner.remote.headers ?? []);
  const out = new Map<string, ConfigField>();
  const add = (input: McpInput) => {
    const key = input.name ?? input.valueHint;
    if (key && !out.has(key)) out.set(key, { key, input: { ...input, name: key } });
  };
  for (const i of inputs) {
    if (i.value === undefined) add(i);
    else for (const [k, v] of Object.entries(i.variables ?? {})) add({ ...v, name: v.name ?? k });
  }
  return [...out.values()];
}

function SecretOrPlainInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const { input, key } = field;
  const secret = input.isSecret === true;
  const choices = input.choices ?? [];
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="font-mono text-xs">
        {secret && <KeyRound className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
        {key}
        {input.isRequired && <span aria-hidden="true">*</span>}
        {input.isRequired && <span className="sr-only">(required)</span>}
      </Label>
      {choices.length > 0 && !secret ? (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={id} aria-label={key} className="w-full">
            <SelectValue placeholder={input.default ?? "Choose"} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-1">
          <Input
            id={id}
            type={secret && !revealed ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={input.placeholder ?? input.default ?? input.valueHint ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-xs"
          />
          {secret && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={revealed ? `Hide ${key}` : `Show ${key}`}
              aria-pressed={revealed}
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          )}
        </div>
      )}
      {input.description && <p className="text-xs text-muted-foreground">{input.description}</p>}
      {secret && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          secret, emitted as {`\${${placeholderName(key)}}`}; never stored or put in a snippet
        </p>
      )}
      {!secret && input.default !== undefined && (
        <p className="text-xs text-muted-foreground">default: {input.default}</p>
      )}
    </div>
  );
}

function SnippetBlock({ snippet, clientLabel, multiple }: { snippet: McpSnippet; clientLabel: string; multiple: boolean }) {
  const label = `${clientLabel} configuration${multiple ? ` (${snippet.label})` : ""}`;
  return (
    <figure className="space-y-1">
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {snippet.label}
          {snippet.filename && (
            <>
              {" "}
              in <code className="font-mono">{snippet.filename}</code>
            </>
          )}
        </span>
        <CopyButton value={snippet.code} label={`Copy ${label}`} onCopied={() => toast.success("Copied")} />
      </figcaption>
      <pre aria-label={label} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
        {snippet.code}
      </pre>
      {snippet.note && <p className="text-xs text-muted-foreground">{snippet.note}</p>}
    </figure>
  );
}

function ClientSnippets({
  client,
  clientLabel,
  entry,
  runner,
  values,
  pinVersion,
  repoKey,
}: {
  client: McpClientId;
  clientLabel: string;
  entry: McpServedEntry;
  runner: McpRunner;
  values: Record<string, string>;
  pinVersion: boolean;
  repoKey: string;
}) {
  const result = buildClientSnippets(client, { server: entry.server, runner, values, pinVersion });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="space-y-4">
      {result.snippets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{clientLabel} cannot run this package directly.</p>
      ) : (
        result.snippets.map((s) => (
          <SnippetBlock key={s.id} snippet={s} clientLabel={clientLabel} multiple={result.snippets.length > 1} />
        ))
      )}
      {client === "vscode" && (
        <div className="space-y-1 rounded-lg border p-3 text-xs">
          <p>Or add the whole registry to VS Code&apos;s MCP gallery:</p>
          <pre aria-label="VS Code gallery setting" className="overflow-x-auto rounded bg-muted p-2 font-mono">
            {`"chat.mcp.gallery.serviceUrl": "${mcpRegistryBaseUrl(origin, repoKey)}"`}
          </pre>
        </div>
      )}
      {result.notes.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label="Notes">
          {result.notes.map((n) => {
            const secretNote = result.secrets.length > 0 && n === result.notes[0];
            return (
              <li
                key={n}
                className={
                  secretNote
                    ? "flex gap-1.5 text-amber-700 dark:text-amber-400"
                    : "flex gap-1.5 text-muted-foreground"
                }
              >
                {secretNote ? (
                  <KeyRound className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                )}
                <span>{n}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Install / Connect panel (issue section 6): pick a way to run the server,
 * a version and a client, fill in its configuration, copy the snippet.
 *
 * Everything typed here lives in component state only: nothing is persisted,
 * nothing is sent, and a value typed into a secret field is dropped before
 * the snippet generators run (they would emit a placeholder anyway).
 */
export function McpInstallPanel({ repoKey, entry, versions, onVersionChange }: McpInstallPanelProps) {
  const runners = useMemo(() => runnersOf(entry.server), [entry.server]);
  const [runnerId, setRunnerId] = useState<string | undefined>(undefined);
  const [pinVersion, setPinVersion] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const groupName = useId();
  const pinId = useId();

  const runner = runners.find((r) => r.id === runnerId) ?? runners[0];
  const fields = useMemo(() => (runner ? configFieldsOf(runner) : []), [runner]);

  if (!runner) return <McpNoRunnerAlert />;

  const snippetValues: Record<string, string> = {};
  for (const f of fields) {
    if (!f.input.isSecret && values[f.key] !== undefined) snippetValues[f.key] = values[f.key];
  }

  return (
    <div className="space-y-5">
      {runners.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Run as</legend>
          {runners.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={groupName}
                value={r.id}
                checked={r.id === runner.id}
                onChange={() => setRunnerId(r.id)}
                className="accent-primary"
              />
              <span className="font-mono text-xs">{runnerLabel(r)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {versions && versions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Version</span>
            <Select value={entry.server.version} onValueChange={(v) => onVersionChange?.(v)}>
              <SelectTrigger aria-label="Version" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.server.version} value={v.server.version}>
                    {v.server.version}
                    {officialMeta(v)?.isLatest ? " (latest)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {runner.kind === "package" && (
          <div className="flex items-center gap-2">
            <Checkbox id={pinId} checked={pinVersion} onCheckedChange={(c) => setPinVersion(c === true)} />
            <Label htmlFor={pinId}>Pin exact version</Label>
          </div>
        )}
      </div>

      {fields.length > 0 && (
        <section aria-label="Configuration" className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Configuration</h3>
            <p className="text-xs text-muted-foreground">
              Never stored. Values are substituted into the snippets below; secrets stay placeholders.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <SecretOrPlainInput
                key={`${runner.id}:${f.key}`}
                field={f}
                value={values[f.key] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
          </div>
        </section>
      )}

      <Tabs defaultValue={MCP_CLIENTS[0].id}>
        <TabsList className="h-auto flex-wrap">
          {MCP_CLIENTS.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {MCP_CLIENTS.map((c) => (
          <TabsContent key={c.id} value={c.id} className="mt-3">
            <ClientSnippets
              client={c.id}
              clientLabel={c.label}
              entry={entry}
              runner={runner}
              values={snippetValues}
              pinVersion={pinVersion}
              repoKey={repoKey}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * The install panel in a side sheet, for the gallery cards. It loads the
 * server's other versions so the user can switch without leaving the list.
 */
export function McpInstallSheet({
  open,
  onOpenChange,
  repoKey,
  entry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  repoKey: string;
  entry: McpServedEntry | null;
}) {
  const name = entry?.server.name ?? "";
  const [picked, setPicked] = useState<{ name: string; version: string } | null>(null);
  const { data: versions } = useQuery({
    queryKey: mcpKeys.versions(repoKey, name),
    queryFn: () => mcpApi.listVersions(repoKey, name),
    enabled: open && !!entry,
  });
  const chosen =
    picked && picked.name === name ? versions?.find((v) => v.server.version === picked.version) : undefined;
  const shown = chosen ?? entry;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {shown && (
          <>
            <SheetHeader>
              <SheetTitle className="break-all">
                Install {shown.server.name} v{shown.server.version}
              </SheetTitle>
              <SheetDescription>
                Pick how to run it and copy the configuration for your client. Nothing you type here is stored.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <McpInstallPanel
                repoKey={repoKey}
                entry={shown}
                versions={versions}
                onVersionChange={(v) => setPicked({ name, version: v })}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
