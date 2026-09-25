"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Info, Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import signingApi from "@/lib/api/signing";
import { mutationErrorToast } from "@/lib/error-utils";
import {
  filterSelectableKeys,
  keyTypeMatchesFormat,
  metadataLabel,
  requiredKeyType,
  signingFormatDescription,
  supportsRepositorySigning,
} from "@/lib/signing-formats";
import type { Repository } from "@/types";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CopyButton } from "@/components/common/copy-button";

const NONE_KEY = "__none__";

interface SigningSettingsProps {
  repository: Repository;
}

export function SigningSettings({ repository }: SigningSettingsProps) {
  const queryClient = useQueryClient();
  const signable = supportsRepositorySigning(repository.format, repository.repo_type);
  const requiredType = requiredKeyType(repository.format);
  const metaLabel = metadataLabel(repository.format);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["signing-config", repository.id],
    queryFn: () => signingApi.getRepoConfig(repository.id),
    enabled: signable,
  });

  const { data: allKeys, isLoading: keysLoading } = useQuery({
    queryKey: ["signing-keys"],
    queryFn: () => signingApi.listKeys(),
    enabled: signable,
  });

  const selectableKeys = useMemo(
    () => filterSelectableKeys(allKeys ?? [], repository.id),
    [allKeys, repository.id],
  );

  const [selectedKeyId, setSelectedKeyId] = useState<string>(NONE_KEY);
  const [signMetadata, setSignMetadata] = useState(false);
  const [signPackages, setSignPackages] = useState(false);
  const [requireSignatures, setRequireSignatures] = useState(false);
  const [dirty, setDirty] = useState(false);

  const effectiveKeyId = dirty
    ? selectedKeyId
    : config?.signing_key_id ?? NONE_KEY;
  const effectiveSignMetadata = dirty ? signMetadata : (config?.sign_metadata ?? false);
  const effectiveSignPackages = dirty ? signPackages : (config?.sign_packages ?? false);
  const effectiveRequireSignatures = dirty
    ? requireSignatures
    : (config?.require_signatures ?? false);

  const selectedKey =
    effectiveKeyId === NONE_KEY
      ? null
      : (selectableKeys.find((k) => k.id === effectiveKeyId) ?? config?.key ?? null);

  const keyTypeMismatch =
    !!selectedKey && !keyTypeMatchesFormat(selectedKey.key_type, repository.format);

  const { data: trustAttestation } = useQuery({
    queryKey: ["signing-key-trust", selectedKey?.id],
    queryFn: () => signingApi.getTrustAttestation(selectedKey!.id),
    enabled: !!selectedKey?.id,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      signingApi.updateRepoConfig(repository.id, {
        signing_key_id: effectiveKeyId === NONE_KEY ? null : effectiveKeyId,
        sign_metadata: effectiveSignMetadata,
        sign_packages: effectiveSignPackages,
        require_signatures: effectiveRequireSignatures,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing-config", repository.id] });
      setDirty(false);
      toast.success("Repository signing configuration saved");
    },
    onError: mutationErrorToast("Failed to save repository signing configuration"),
  });

  const createKeyMutation = useMutation({
    mutationFn: () =>
      signingApi.createKey({
        name: `${repository.key}-signing`,
        key_type: requiredType,
        repository_id: repository.id,
        // UID only matters for GPG keys (Debian/RPM); it is embedded in the
        // OpenPGP public key clients import.
        ...(requiredType === "gpg"
          ? {
              uid_name: `${repository.name} signing`,
              uid_email: `${repository.key}@artifact-keeper.local`,
            }
          : {}),
      }),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ["signing-keys"] });
      setSelectedKeyId(key.id);
      setSignMetadata(true);
      setDirty(true);
      toast.success(`Created signing key "${key.name}"`, {
        description: "Save the configuration below to enable signing for this repository.",
      });
    },
    onError: mutationErrorToast("Failed to create repository signing key"),
  });

  const markDirty = () => setDirty(true);

  if (!signable) {
    return (
      <section aria-labelledby="settings-signing-heading">
        <div className="flex items-center gap-2 mb-2">
          <FileSignature className="size-4 text-muted-foreground" />
          <h3 id="settings-signing-heading" className="text-base font-semibold">
            Repository Signing
          </h3>
        </div>
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            Cryptographic signing is available only for Debian, RPM, Alpine, and Conda
            repositories of type local, staging, or virtual. This repository (
            {`${repository.format}, ${repository.repo_type}`}) is not eligible.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const loading = configLoading || keysLoading;
  const showAttestationWarning =
    effectiveSignMetadata &&
    effectiveKeyId !== NONE_KEY &&
    trustAttestation?.verification_status !== "verified";

  return (
    <section aria-labelledby="settings-signing-heading">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <FileSignature className="size-4 text-muted-foreground" />
          <h3 id="settings-signing-heading" className="text-base font-semibold">
            Repository Signing
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {signingFormatDescription(repository.format)} This format requires a{" "}
          <span className="font-medium uppercase">{requiredType}</span> key.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo-signing-key">Signing key</Label>
            <Select
              value={effectiveKeyId}
              onValueChange={(value) => {
                setSelectedKeyId(value);
                markDirty();
              }}
            >
              <SelectTrigger id="repo-signing-key">
                <SelectValue placeholder="Select a signing key" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_KEY}>No signing key</SelectItem>
                {selectableKeys.map((key) => {
                  const compatible = keyTypeMatchesFormat(key.key_type, repository.format);
                  return (
                    <SelectItem key={key.id} value={key.id}>
                      {key.name}
                      {key.repository_id ? " (repo-scoped)" : " (global)"}
                      {" · "}
                      {key.key_type.toUpperCase()}
                      {!compatible ? " — incompatible" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose a global key shared across repositories or a key scoped to this repository.
              Manage keys on the{" "}
              <Link href="/signing" className="underline underline-offset-2">
                Signing
              </Link>{" "}
              page.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate()}
            >
              {createKeyMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSignature className="size-4" />
              )}
              Create {requiredType.toUpperCase()} key for this repository
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link href="/signing">
                <ExternalLink className="size-4" />
                Open signing keys
              </Link>
            </Button>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="repo-sign-metadata">Sign metadata</Label>
                <p className="text-xs text-muted-foreground">
                  Sign {metaLabel} with the selected key when clients fetch repository indexes.
                </p>
              </div>
              <Switch
                id="repo-sign-metadata"
                checked={effectiveSignMetadata}
                disabled={effectiveKeyId === NONE_KEY || keyTypeMismatch}
                onCheckedChange={(checked) => {
                  setSignMetadata(checked);
                  markDirty();
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="repo-sign-packages">Verify package signatures</Label>
                <p className="text-xs text-muted-foreground">
                  Validate detached signatures on uploaded packages when present.
                </p>
              </div>
              <Switch
                id="repo-sign-packages"
                checked={effectiveSignPackages}
                disabled={effectiveKeyId === NONE_KEY}
                onCheckedChange={(checked) => {
                  setSignPackages(checked);
                  markDirty();
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="repo-require-signatures">Require signatures on upload</Label>
                <p className="text-xs text-muted-foreground">
                  Reject uploads that are not signed when signature verification is enabled.
                </p>
              </div>
              <Switch
                id="repo-require-signatures"
                checked={effectiveRequireSignatures}
                disabled={effectiveKeyId === NONE_KEY || !effectiveSignPackages}
                onCheckedChange={(checked) => {
                  setRequireSignatures(checked);
                  markDirty();
                }}
              />
            </div>
          </div>

          {keyTypeMismatch && selectedKey && (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertTitle>Incompatible key type</AlertTitle>
              <AlertDescription>
                {repository.format.toUpperCase()} repositories require a{" "}
                <span className="font-medium uppercase">{requiredType}</span> key, but{" "}
                <span className="font-medium">{selectedKey.name}</span> is a{" "}
                <span className="uppercase">{selectedKey.key_type}</span> key. Signatures produced
                with this key cannot be verified by clients. Select or create a {requiredType.toUpperCase()}{" "}
                key instead.
              </AlertDescription>
            </Alert>
          )}

          {showAttestationWarning && !keyTypeMismatch && (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>Key is not attested</AlertTitle>
              <AlertDescription>
                Metadata signing is enabled with a key that has no external trust attestation.
                Consider attesting the key on the Signing page so operators can prove it was
                authorized by your root key (for example on a YubiKey).
              </AlertDescription>
            </Alert>
          )}

          {selectedKey && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Selected key details</p>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="uppercase text-xs">
                    {selectedKey.key_type}
                  </Badge>
                  {trustAttestation?.verification_status === "verified" ? (
                    <Badge variant="secondary" className="text-xs">
                      Attested
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Not attested
                    </Badge>
                  )}
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {selectedKey.fingerprint ?? selectedKey.key_id ?? selectedKey.algorithm}
              </p>
              {(selectedKey.uid_name || selectedKey.uid_email) && (
                <p className="text-xs text-muted-foreground">
                  GPG UID:{" "}
                  <span className="text-foreground">
                    {selectedKey.uid_name}
                    {selectedKey.uid_email ? ` <${selectedKey.uid_email}>` : ""}
                  </span>
                </p>
              )}
              <div className="relative">
                <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">
                  {selectedKey.public_key_pem}
                </pre>
                <div className="absolute right-2 top-2">
                  <CopyButton value={selectedKey.public_key_pem} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Distribute this public key to clients so they can trust signed metadata from this
                repository.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !dirty ||
                (effectiveSignMetadata && effectiveKeyId === NONE_KEY) ||
                (effectiveSignMetadata && keyTypeMismatch)
              }
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Signing Configuration"
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
