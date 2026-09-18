"use client";

/**
 * Upstream authentication type options, request builder and the conditional
 * AWS field group (issue #857, backend 1.10.0 artifact-keeper#1559).
 *
 * Backend 1.10.0 adds two *dynamic* upstream auth types to
 * `PUT /api/v1/repositories/{key}/upstream-auth`: `aws_ecr` and
 * `aws_codeartifact`. Neither takes a password — the server mints a
 * short-lived token from its own AWS identity (IRSA / EKS Pod Identity /
 * instance profile / `AWS_*` environment keys) and stores only the non-secret
 * provider settings, which are never returned on a read. The AWS types are
 * *not* accepted on the repository-create body, so they are offered only on
 * the edit/settings surface.
 *
 * The value shape is string-based so every field stays a controlled input;
 * {@link buildUpstreamAuthPayload} turns it into the exact request body at
 * submit time.
 */

import type {
  AwsUpstreamAuthConfig,
  UpstreamAuthPayload,
} from "@/lib/api/repositories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const AUTH_TYPE_ECR = "aws_ecr";
export const AUTH_TYPE_CODEARTIFACT = "aws_codeartifact";

/** Auth types offered on the edit/settings upstream-auth form. */
export const UPSTREAM_AUTH_TYPE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic (username + password)" },
  { value: "bearer", label: "Bearer token" },
  { value: AUTH_TYPE_ECR, label: "Amazon ECR (IAM)" },
  { value: AUTH_TYPE_CODEARTIFACT, label: "AWS CodeArtifact (IAM)" },
];

/** True when `authType` selects one of the dynamic AWS providers. */
export function isAwsUpstreamAuthType(authType: string | null | undefined): boolean {
  return authType === AUTH_TYPE_ECR || authType === AUTH_TYPE_CODEARTIFACT;
}

/**
 * Human label for a stored `upstream_auth_type`. Unknown values (a newer
 * backend than this UI) degrade to the raw string rather than disappearing.
 */
export function upstreamAuthTypeLabel(authType: string | null | undefined): string {
  switch (authType) {
    case "basic":
      return "Basic Auth";
    case "bearer":
      return "Bearer Token";
    case AUTH_TYPE_ECR:
      return "Amazon ECR";
    case AUTH_TYPE_CODEARTIFACT:
      return "AWS CodeArtifact";
    default:
      return authType ?? "";
  }
}

// ---------------------------------------------------------------------------
// Value shape + request builder
// ---------------------------------------------------------------------------

export interface AwsUpstreamAuthValue {
  region: string;
  registry_id: string;
  domain: string;
  domain_owner: string;
  /** Kept as text so the input stays controlled while it is empty. */
  duration_seconds: string;
}

export const EMPTY_AWS_UPSTREAM_AUTH: AwsUpstreamAuthValue = {
  region: "",
  registry_id: "",
  domain: "",
  domain_owner: "",
  duration_seconds: "",
};

export interface UpstreamAuthFormValue {
  username: string;
  password: string;
  aws: AwsUpstreamAuthValue;
}

/** Trim a field, collapsing blank-only input to `undefined` so it is omitted. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function buildAwsConfig(
  authType: string,
  aws: AwsUpstreamAuthValue,
): AwsUpstreamAuthConfig {
  if (authType === AUTH_TYPE_ECR) {
    return { region: aws.region.trim(), registry_id: optional(aws.registry_id) };
  }
  const duration = optional(aws.duration_seconds);
  const parsed = duration === undefined ? undefined : Number(duration);
  return {
    region: aws.region.trim(),
    domain: aws.domain.trim(),
    domain_owner: optional(aws.domain_owner),
    // A non-numeric entry is dropped rather than sent as NaN (which JSON
    // encodes as `null` and the backend would reject with a confusing error).
    duration_seconds:
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
  };
}

/**
 * Build the `PUT .../upstream-auth` body for the selected auth type.
 *
 * Only the fields that belong to the chosen type are emitted: the AWS types
 * never carry a username/password, and `basic`/`bearer` never carry an `aws`
 * block. Optional AWS fields left blank are omitted entirely so the backend
 * applies its own defaults (caller's account, AWS's 12-hour token lifetime).
 */
export function buildUpstreamAuthPayload(
  authType: string,
  value: UpstreamAuthFormValue,
): UpstreamAuthPayload {
  const payload: UpstreamAuthPayload = { auth_type: authType };
  if (authType === "basic") {
    payload.username = value.username;
    payload.password = value.password;
  } else if (authType === "bearer") {
    payload.password = value.password;
  } else if (isAwsUpstreamAuthType(authType)) {
    payload.aws = buildAwsConfig(authType, value.aws);
  }
  return payload;
}

/**
 * Whether the form has everything the backend requires for `authType`. Drives
 * the save button's disabled state; the backend re-validates the formats
 * (region shape, 12-digit account ids, the 900..=43200 duration range) and its
 * message is surfaced in the mutation's error toast.
 */
export function isUpstreamAuthComplete(
  authType: string,
  value: UpstreamAuthFormValue,
): boolean {
  switch (authType) {
    case "none":
      return true;
    case "basic":
      return Boolean(value.username && value.password);
    case "bearer":
      return Boolean(value.password);
    case AUTH_TYPE_ECR:
      return Boolean(value.aws.region.trim());
    case AUTH_TYPE_CODEARTIFACT:
      return Boolean(value.aws.region.trim() && value.aws.domain.trim());
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Field group
// ---------------------------------------------------------------------------

interface AwsUpstreamAuthFieldsProps {
  /** `aws_ecr` or `aws_codeartifact` — selects which fields are shown. */
  authType: string;
  value: AwsUpstreamAuthValue;
  onChange: (next: AwsUpstreamAuthValue) => void;
  idPrefix: string;
}

/**
 * The conditional AWS provider settings. Nothing here is a secret, so the
 * inputs are plain text — but the stored values are never returned by the API
 * either, so the group always starts empty and a change means re-entering it.
 */
export function AwsUpstreamAuthFields({
  authType,
  value,
  onChange,
  idPrefix,
}: AwsUpstreamAuthFieldsProps) {
  if (!isAwsUpstreamAuthType(authType)) return null;
  const isCodeArtifact = authType === AUTH_TYPE_CODEARTIFACT;
  const set = (patch: Partial<AwsUpstreamAuthValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3" data-testid="aws-upstream-auth-fields">
      <p className="text-xs text-muted-foreground">
        No credential is stored: tokens are minted with the server&apos;s own AWS
        identity (IRSA, EKS Pod Identity, an instance profile or{" "}
        <code>AWS_*</code> environment keys) and refreshed before they expire.
        The repository&apos;s upstream URL must point at the matching{" "}
        {isCodeArtifact ? "CodeArtifact" : "ECR"} endpoint. These settings are
        not returned on read, so re-enter them to change them.
      </p>

      <Label htmlFor={`${idPrefix}-aws-region`}>AWS region</Label>
      <Input
        id={`${idPrefix}-aws-region`}
        placeholder="us-east-1"
        required
        value={value.region}
        onChange={(e) => set({ region: e.target.value })}
        autoComplete="off"
      />

      {isCodeArtifact ? (
        <>
          <Label htmlFor={`${idPrefix}-aws-domain`}>CodeArtifact domain</Label>
          <Input
            id={`${idPrefix}-aws-domain`}
            placeholder="my-domain"
            required
            value={value.domain}
            onChange={(e) => set({ domain: e.target.value })}
            autoComplete="off"
          />

          <Label htmlFor={`${idPrefix}-aws-domain-owner`}>
            Domain owner (optional)
          </Label>
          <Input
            id={`${idPrefix}-aws-domain-owner`}
            placeholder="123456789012"
            value={value.domain_owner}
            onChange={(e) => set({ domain_owner: e.target.value })}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            12-digit account id owning the domain. Defaults to the server&apos;s
            own account.
          </p>

          <Label htmlFor={`${idPrefix}-aws-duration`}>
            Token lifetime (optional)
          </Label>
          <Input
            id={`${idPrefix}-aws-duration`}
            type="number"
            placeholder="43200"
            value={value.duration_seconds}
            onChange={(e) => set({ duration_seconds: e.target.value })}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Seconds: 0, or 900–43200. Defaults to the AWS default of 12 hours.
          </p>
        </>
      ) : (
        <>
          <Label htmlFor={`${idPrefix}-aws-registry-id`}>
            Registry ID (optional)
          </Label>
          <Input
            id={`${idPrefix}-aws-registry-id`}
            placeholder="123456789012"
            value={value.registry_id}
            onChange={(e) => set({ registry_id: e.target.value })}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            12-digit account id of the ECR registry being proxied. Pins the
            upstream host; leave empty to accept any account in the region.
          </p>
        </>
      )}
    </div>
  );
}
