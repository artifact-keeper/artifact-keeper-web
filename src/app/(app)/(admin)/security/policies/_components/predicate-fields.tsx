"use client";

import React from "react";

import {
  ATTESTATION_STATES,
  INSTALL_SCRIPT_SEVERITIES,
  ORIGIN_KINDS,
  emptyPredicates,
  formatList,
  parseList,
  type PolicyPredicates,
} from "@/lib/policy-predicates";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Editable form of the predicate document: list fields as free text. */
export interface PredicateDraft {
  allowed_channels: string;
  denied_channels: string;
  denied_licenses: string;
  denied_license_families: string;
  block_install_scripts: boolean;
  max_install_script_severity: string;
  min_attestation_state: string;
  allowed_upstreams: string;
  denied_upstreams: string;
  allowed_repositories: string;
  denied_repositories: string;
  allowed_kinds: string[];
}

// Radix Select cannot hold "", so "not set" is a sentinel.
export const NOT_SET = "__none__";

export function draftFromPredicates(p: PolicyPredicates | undefined): PredicateDraft {
  const d = p ?? emptyPredicates();
  return {
    allowed_channels: formatList(d.conda.allowed_channels),
    denied_channels: formatList(d.conda.denied_channels),
    denied_licenses: formatList(d.conda.denied_licenses),
    denied_license_families: formatList(d.conda.denied_license_families),
    block_install_scripts: d.conda.block_install_scripts,
    max_install_script_severity: d.conda.max_install_script_severity ?? NOT_SET,
    min_attestation_state: d.conda.min_attestation_state ?? NOT_SET,
    allowed_upstreams: formatList(d.origin.allowed_upstreams),
    denied_upstreams: formatList(d.origin.denied_upstreams),
    allowed_repositories: formatList(d.origin.allowed_repositories),
    denied_repositories: formatList(d.origin.denied_repositories),
    allowed_kinds: [...d.origin.allowed_kinds],
  };
}

export function predicatesFromDraft(d: PredicateDraft): PolicyPredicates {
  return {
    conda: {
      allowed_channels: parseList(d.allowed_channels),
      denied_channels: parseList(d.denied_channels),
      denied_licenses: parseList(d.denied_licenses),
      denied_license_families: parseList(d.denied_license_families),
      block_install_scripts: d.block_install_scripts,
      max_install_script_severity:
        d.max_install_script_severity === NOT_SET ? null : d.max_install_script_severity,
      min_attestation_state:
        d.min_attestation_state === NOT_SET ? null : d.min_attestation_state,
    },
    origin: {
      allowed_upstreams: parseList(d.allowed_upstreams),
      denied_upstreams: parseList(d.denied_upstreams),
      allowed_repositories: parseList(d.allowed_repositories),
      denied_repositories: parseList(d.denied_repositories),
      allowed_kinds: ORIGIN_KINDS.filter((k) => d.allowed_kinds.includes(k)),
    },
  };
}

const KIND_LABELS: Record<(typeof ORIGIN_KINDS)[number], string> = {
  hosted: "Hosted (uploaded)",
  proxy: "Proxy (fetched from upstream)",
  virtual: "Virtual",
  migration: "Migration (imported)",
};

function ListField({
  id,
  label,
  help,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs font-mono"
      />
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  );
}

/**
 * Conda and origin predicates of a scan policy (#911). Enforced on promotion
 * as rule `policy-predicate` at high severity (backend #4165).
 */
export function PredicateFields({
  draft,
  onChange,
}: {
  draft: PredicateDraft;
  onChange: (next: PredicateDraft) => void;
}) {
  const set = <K extends keyof PredicateDraft>(key: K, value: PredicateDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-4 rounded-md border p-3" data-testid="policy-predicates">
      <div>
        <p className="text-sm font-medium">Conda and origin predicates</p>
        <p className="text-xs text-muted-foreground">
          Checked when an artifact is promoted, as rule{" "}
          <code>policy-predicate</code> at high severity, for repository and
          global policies alike. Lists are comma-separated and compared
          case-insensitively. Leave a field empty to not check it.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase text-muted-foreground">Conda</legend>
        <ListField
          id="pred-allowed-channels"
          label="Allowed channels"
          help="If set, the package's channel of origin must be one of these. A package whose channel is unknown fails."
          placeholder="conda-forge, internal"
          value={draft.allowed_channels}
          onChange={(v) => set("allowed_channels", v)}
        />
        <ListField
          id="pred-denied-channels"
          label="Denied channels"
          help="The package's channel of origin must not be one of these."
          placeholder="defaults"
          value={draft.denied_channels}
          onChange={(v) => set("denied_channels", v)}
        />
        <ListField
          id="pred-denied-licenses"
          label="Denied licenses"
          help="SPDX identifiers that must not be the package's declared license. An undeclared license is not denied."
          placeholder="GPL-3.0-only, AGPL-3.0-only"
          value={draft.denied_licenses}
          onChange={(v) => set("denied_licenses", v)}
        />
        <ListField
          id="pred-denied-license-families"
          label="Denied license families"
          help="Conda license_family values, for example GPL, AGPL, LGPL."
          placeholder="GPL, AGPL"
          value={draft.denied_license_families}
          onChange={(v) => set("denied_license_families", v)}
        />
        <div className="flex items-center gap-3">
          <Switch
            id="pred-block-install-scripts"
            checked={draft.block_install_scripts}
            onCheckedChange={(v) => set("block_install_scripts", v)}
          />
          <Label htmlFor="pred-block-install-scripts" className="text-xs">
            Block packages with install scripts (pre-link, post-link, pre-unlink)
          </Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Max install-script finding</Label>
            <Select
              value={draft.max_install_script_severity}
              onValueChange={(v) => set("max_install_script_severity", v)}
            >
              <SelectTrigger className="h-8 w-full text-xs" aria-label="Max install-script finding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>Not checked</SelectItem>
                {INSTALL_SCRIPT_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    Block at {s} or above
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Publish attestation</Label>
            <Select
              value={draft.min_attestation_state}
              onValueChange={(v) => set("min_attestation_state", v)}
            >
              <SelectTrigger className="h-8 w-full text-xs" aria-label="Publish attestation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>Not required</SelectItem>
                {ATTESTATION_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "present" ? "Present (any verification state)" : "Verified"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          &quot;Verified&quot; means the CEP-27 Sigstore bundle passed the
          registry&apos;s verification on upload against its trust policy;
          &quot;Present&quot; accepts any stored attestation, verified or not.
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase text-muted-foreground">Origin (all formats)</legend>
        <div className="space-y-1">
          <p className="text-xs">Allowed origin kinds</p>
          <div className="grid grid-cols-2 gap-2">
            {ORIGIN_KINDS.map((k) => (
              <label key={k} className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={draft.allowed_kinds.includes(k)}
                  onCheckedChange={(c) =>
                    set(
                      "allowed_kinds",
                      c === true
                        ? [...draft.allowed_kinds, k]
                        : draft.allowed_kinds.filter((x) => x !== k),
                    )
                  }
                  aria-label={KIND_LABELS[k]}
                />
                <span>
                  {KIND_LABELS[k]}
                  {k === "proxy" && (
                    <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                      No production path records this kind yet
                      (artifact-keeper#4161): a policy that allows only
                      proxy matches nothing.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            None checked: any kind. Checked: the artifact&apos;s ingest kind must be one of these.
          </p>
        </div>
        <ListField
          id="pred-allowed-upstreams"
          label="Allowed upstreams"
          help="If set, the upstream URL that supplied the bytes must be one of these. Hosted uploads have no upstream and fail."
          placeholder="https://conda.anaconda.org/conda-forge"
          value={draft.allowed_upstreams}
          onChange={(v) => set("allowed_upstreams", v)}
        />
        <ListField
          id="pred-denied-upstreams"
          label="Denied upstreams"
          help="The upstream URL must not be one of these."
          placeholder=""
          value={draft.denied_upstreams}
          onChange={(v) => set("denied_upstreams", v)}
        />
        <ListField
          id="pred-allowed-repositories"
          label="Allowed origin repositories"
          help="If set, the repository the artifact entered through must be one of these keys."
          placeholder="conda-staging"
          value={draft.allowed_repositories}
          onChange={(v) => set("allowed_repositories", v)}
        />
        <ListField
          id="pred-denied-repositories"
          label="Denied origin repositories"
          help="The repository the artifact entered through must not be one of these keys."
          placeholder=""
          value={draft.denied_repositories}
          onChange={(v) => set("denied_repositories", v)}
        />
      </fieldset>
    </div>
  );
}
