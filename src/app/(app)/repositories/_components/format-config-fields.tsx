"use client";

/**
 * Format-specific repository configuration fields (issue #602, 1.6.0).
 *
 * These controlled, presentational field groups are shared verbatim between the
 * create dialog (`repo-dialogs.tsx`) and the settings/edit tab
 * (`repo-settings-tab.tsx`) so the two surfaces never drift. Each group owns no
 * state of its own — the parent holds a string-based value object (lists are
 * edited as comma/newline-separated text) and receives the next value on every
 * change. The `build*` helpers turn those value objects into the exact SDK
 * request fields at submit time.
 *
 * The three groups map to distinct 1.6.0 backend features:
 *  - RPM curation trusted GPG key (#2568)
 *  - Advanced Debian/APT config + Release metadata (#2407/#2460/#2489/#2459)
 *  - npm scope policy (#2424)
 */

import type { DebianRepoConfig } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Value shapes (string-based so every field stays a controlled input)
// ---------------------------------------------------------------------------

export interface RpmConfigValue {
  /** ASCII-armored OpenPGP *public* key block, or empty to leave unset. */
  trusted_gpg_key: string;
}

export interface DebianConfigValue {
  // Release metadata (top-level apt_* fields on the request)
  apt_origin: string;
  apt_label: string;
  apt_release_version: string;
  apt_description: string;
  // Proxy/remote distro-filter allowlists (comma/newline-separated).
  // Empty list = "all" (today's full-proxy behaviour).
  distribution_paths: string;
  components: string;
  architectures: string;
}

export interface NpmScopePolicyValue {
  /** Allowed `@scope` literals / globs, comma/newline-separated. */
  npm_allowed_scopes: string;
  /** Allowed full-name globs (`@acme*`, `internal-*`), comma/newline-separated. */
  npm_allowed_name_patterns: string;
  /** Whether unscoped package names may resolve through this repo. */
  npm_allow_unscoped: boolean;
}

export const EMPTY_RPM_CONFIG: RpmConfigValue = { trusted_gpg_key: "" };

export const EMPTY_DEBIAN_CONFIG: DebianConfigValue = {
  apt_origin: "",
  apt_label: "",
  apt_release_version: "",
  apt_description: "",
  distribution_paths: "",
  components: "",
  architectures: "",
};

export const EMPTY_NPM_SCOPE_POLICY: NpmScopePolicyValue = {
  npm_allowed_scopes: "",
  npm_allowed_name_patterns: "",
  npm_allow_unscoped: false,
};

// ---------------------------------------------------------------------------
// List <-> text conversion
// ---------------------------------------------------------------------------

/** Split a comma/newline-separated field into a trimmed, de-blanked list. */
export function parseList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Render a stored list back into a comma-separated field value. */
export function formatList(list?: string[] | null): string {
  return (list ?? []).join(", ");
}

// ---------------------------------------------------------------------------
// Request-field builders (pure; used by both create and edit submit paths)
// ---------------------------------------------------------------------------

export interface RpmConfigFields {
  trusted_gpg_key?: string;
}

/** Only emit `trusted_gpg_key` when the operator actually typed a key. */
export function buildRpmConfigFields(value: RpmConfigValue): RpmConfigFields {
  const key = value.trusted_gpg_key.trim();
  return key ? { trusted_gpg_key: key } : {};
}

export interface DebianConfigFieldsPayload {
  apt_origin?: string;
  apt_label?: string;
  apt_release_version?: string;
  apt_description?: string;
  debian?: DebianRepoConfig;
}

export function buildDebianConfigFields(
  value: DebianConfigValue,
): DebianConfigFieldsPayload {
  return {
    apt_origin: value.apt_origin.trim() || undefined,
    apt_label: value.apt_label.trim() || undefined,
    apt_release_version: value.apt_release_version.trim() || undefined,
    apt_description: value.apt_description.trim() || undefined,
    debian: {
      distribution_paths: parseList(value.distribution_paths),
      components: parseList(value.components),
      architectures: parseList(value.architectures),
    },
  };
}

export interface NpmScopePolicyFieldsPayload {
  npm_allowed_scopes?: string[];
  npm_allowed_name_patterns?: string[];
  npm_allow_unscoped?: boolean;
}

export function buildNpmScopePolicyFields(
  value: NpmScopePolicyValue,
): NpmScopePolicyFieldsPayload {
  return {
    npm_allowed_scopes: parseList(value.npm_allowed_scopes),
    npm_allowed_name_patterns: parseList(value.npm_allowed_name_patterns),
    npm_allow_unscoped: value.npm_allow_unscoped,
  };
}

// ---------------------------------------------------------------------------
// Field groups
// ---------------------------------------------------------------------------

interface RpmTrustedKeyFieldProps {
  value: RpmConfigValue;
  onChange: (next: RpmConfigValue) => void;
  idPrefix: string;
  /** Whether a trusted key is already stored (never the key material itself). */
  hasExistingKey?: boolean;
  /** When provided and a key exists, renders a "Remove" control (edit only). */
  onRemove?: () => void;
  removePending?: boolean;
}

/**
 * RPM curation *trusted* GPG key (#2568). This is the upstream public key used
 * to verify a proxied RPM remote's `repomd.xml.asc` — NOT a server-side signing
 * key. The key is write-only server-side: the response exposes only the
 * `has_trusted_gpg_key` boolean, so the textarea always starts empty and a
 * stored key is surfaced via `hasExistingKey`.
 */
export function RpmTrustedKeyField({
  value,
  onChange,
  idPrefix,
  hasExistingKey = false,
  onRemove,
  removePending = false,
}: RpmTrustedKeyFieldProps) {
  const id = `${idPrefix}-rpm-gpg-key`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Trusted GPG Public Key</Label>
      <p className="text-xs text-muted-foreground">
        ASCII-armored OpenPGP <strong>public</strong> key trusted to sign this
        RPM remote&apos;s repository metadata (<code>repomd.xml</code>). When
        set, curation sync verifies the upstream signature before ingesting.
        This is the proxy-verification trusted key, not a server-side signing
        key.
      </p>
      {hasExistingKey && (
        <div
          className="flex items-center justify-between rounded border border-muted bg-muted/30 p-2"
          data-testid={`${idPrefix}-rpm-gpg-status`}
        >
          <p className="text-xs text-muted-foreground">
            A trusted key is configured. Entering a new key below replaces it.
          </p>
          {onRemove && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={removePending}
              onClick={onRemove}
            >
              {removePending ? "Removing..." : "Remove"}
            </Button>
          )}
        </div>
      )}
      <Textarea
        id={id}
        placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;..."
        value={value.trusted_gpg_key}
        onChange={(e) => onChange({ trusted_gpg_key: e.target.value })}
        rows={4}
        className="font-mono text-xs"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

interface DebianConfigFieldsProps {
  value: DebianConfigValue;
  onChange: (next: DebianConfigValue) => void;
  idPrefix: string;
}

/**
 * Advanced Debian/APT configuration (#2407/#2460/#2489/#2459): the proxy
 * distro/component/architecture filter allowlists plus the `Release`-file
 * metadata (Origin, Label, Version, Description).
 */
export function DebianConfigFields({
  value,
  onChange,
  idPrefix,
}: DebianConfigFieldsProps) {
  const set = (patch: Partial<DebianConfigValue>) =>
    onChange({ ...value, ...patch });
  const fid = (name: string) => `${idPrefix}-debian-${name}`;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Proxy filters
        </p>
        <p className="text-xs text-muted-foreground">
          Comma-separated allowlists for a Debian proxy. Leave empty (or use{" "}
          <code>*</code>) to proxy everything. Architecture-independent{" "}
          (<code>all</code>) packages are always permitted.
        </p>
        <div className="space-y-2">
          <Label htmlFor={fid("distributions")}>
            Distributions (suites / codenames)
          </Label>
          <Input
            id={fid("distributions")}
            placeholder="bookworm, bullseye"
            value={value.distribution_paths}
            onChange={(e) => set({ distribution_paths: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fid("components")}>Components</Label>
          <Input
            id={fid("components")}
            placeholder="main, contrib, non-free"
            value={value.components}
            onChange={(e) => set({ components: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fid("architectures")}>Architectures</Label>
          <Input
            id={fid("architectures")}
            placeholder="amd64, arm64"
            value={value.architectures}
            onChange={(e) => set({ architectures: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Release metadata
        </p>
        <p className="text-xs text-muted-foreground">
          Optional fields written into generated <code>Release</code> files.
        </p>
        <div className="space-y-2">
          <Label htmlFor={fid("origin")}>Origin</Label>
          <Input
            id={fid("origin")}
            placeholder="artifact-keeper"
            value={value.apt_origin}
            onChange={(e) => set({ apt_origin: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fid("label")}>Label</Label>
          <Input
            id={fid("label")}
            placeholder="artifact-keeper"
            value={value.apt_label}
            onChange={(e) => set({ apt_label: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fid("version")}>Version</Label>
          <Input
            id={fid("version")}
            placeholder="1.0"
            value={value.apt_release_version}
            onChange={(e) => set({ apt_release_version: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fid("description")}>Description</Label>
          <Input
            id={fid("description")}
            placeholder="Internal Debian mirror"
            value={value.apt_description}
            onChange={(e) => set({ apt_description: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

interface NpmScopePolicyFieldsProps {
  value: NpmScopePolicyValue;
  onChange: (next: NpmScopePolicyValue) => void;
  idPrefix: string;
}

/**
 * npm scope policy (#2424): the set of `@scope` literals / name globs that may
 * resolve through this npm repository, plus whether bare (unscoped) names are
 * allowed at all. Used for npm virtual/remote repos to constrain which packages
 * the aggregate serves.
 */
export function NpmScopePolicyFields({
  value,
  onChange,
  idPrefix,
}: NpmScopePolicyFieldsProps) {
  const set = (patch: Partial<NpmScopePolicyValue>) =>
    onChange({ ...value, ...patch });
  const scopesId = `${idPrefix}-npm-scopes`;
  const patternsId = `${idPrefix}-npm-patterns`;
  const unscopedId = `${idPrefix}-npm-unscoped`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={scopesId}>Allowed scopes</Label>
        <Textarea
          id={scopesId}
          placeholder="@acme, @internal"
          value={value.npm_allowed_scopes}
          onChange={(e) => set({ npm_allowed_scopes: e.target.value })}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Comma or newline-separated <code>@scope</code> literals. Empty leaves
          the repository unrestricted by scope.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={patternsId}>Allowed name patterns</Label>
        <Textarea
          id={patternsId}
          placeholder="@acme*, internal-*"
          value={value.npm_allowed_name_patterns}
          onChange={(e) => set({ npm_allowed_name_patterns: e.target.value })}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Additive glob patterns (<code>*</code>/<code>?</code>). A name is
          allowed if its scope is allowed OR any pattern matches.
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor={unscopedId}>Allow unscoped names</Label>
          <p className="text-xs text-muted-foreground">
            Permit bare (non-<code>@scope</code>) package names to resolve.
          </p>
        </div>
        <Switch
          id={unscopedId}
          checked={value.npm_allow_unscoped}
          onCheckedChange={(v) => set({ npm_allow_unscoped: v })}
        />
      </div>
    </div>
  );
}
