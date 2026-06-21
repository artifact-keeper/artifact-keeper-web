"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileSignature,
  Plus,
  Trash2,
  RotateCcw,
  Ban,
  Eye,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import signingApi, { type SigningKey, type CreateSigningKeyRequest } from "@/lib/api/signing";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/common/copy-button";
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

const KEY_QUERY_KEY = ["signing-keys"];

const emptyForm: CreateSigningKeyRequest = {
  name: "",
  key_type: "gpg",
};

export default function SigningPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateSigningKeyRequest>(emptyForm);
  const [viewKey, setViewKey] = useState<SigningKey | null>(null);
  const [rotateTarget, setRotateTarget] = useState<SigningKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SigningKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SigningKey | null>(null);

  const { data: keys, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: KEY_QUERY_KEY,
    queryFn: () => signingApi.listKeys(),
    enabled: !!user?.is_admin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (req: CreateSigningKeyRequest) => signingApi.createKey(req),
    onSuccess: (key) => {
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
      toast.success(`Signing key "${key.name}" created`);
    },
    onError: mutationErrorToast("Failed to create signing key"),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => signingApi.rotateKey(id),
    onSuccess: () => {
      invalidate();
      setRotateTarget(null);
      toast.success("Signing key rotated");
    },
    onError: mutationErrorToast("Failed to rotate signing key"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => signingApi.revokeKey(id),
    onSuccess: () => {
      invalidate();
      setRevokeTarget(null);
      toast.success("Signing key revoked");
    },
    onError: mutationErrorToast("Failed to revoke signing key"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => signingApi.deleteKey(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("Signing key deleted");
    },
    onError: mutationErrorToast("Failed to delete signing key"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <FileSignature className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">Signing key management requires administrator access.</p>
      </div>
    );
  }

  const canCreate = form.name.trim() !== "" && !createMutation.isPending;

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    // Omit blank optional UID fields rather than sending empty strings.
    const req: CreateSigningKeyRequest = { name: form.name.trim(), key_type: form.key_type };
    if (form.uid_name?.trim()) req.uid_name = form.uid_name.trim();
    if (form.uid_email?.trim()) req.uid_email = form.uid_email.trim();
    createMutation.mutate(req);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Signing Keys</h1>
            <p className="text-sm text-muted-foreground">
              GPG and RSA keys used to sign Debian, RPM, Alpine, and Conda artifacts.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Key
        </Button>
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
          <p className="text-sm font-medium">Couldn&apos;t load signing keys</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (keys?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <FileSignature className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No signing keys yet.</p>
          <p className="text-xs">Create one to start signing artifacts.</p>
        </div>
      )}

      {!isLoading && !isError && (keys?.length ?? 0) > 0 && (
        <ul className="divide-y rounded-md border">
          {keys!.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{key.name}</span>
                  <Badge variant="outline" className="uppercase">{key.key_type}</Badge>
                  {key.is_active ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="destructive">revoked</Badge>
                  )}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {key.fingerprint ?? key.key_id ?? key.algorithm}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`View public key for ${key.name}`} onClick={() => setViewKey(key)}>
                  <Eye className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Rotate ${key.name}`} onClick={() => setRotateTarget(key)}>
                  <RotateCcw className="size-4" />
                </Button>
                {key.is_active && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${key.name}`} onClick={() => setRevokeTarget(key)}>
                    <Ban className="size-4 text-amber-500" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${key.name}`} onClick={() => setDeleteTarget(key)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={submitCreate}>
            <DialogHeader>
              <DialogTitle>New signing key</DialogTitle>
              <DialogDescription>
                Generate a key pair. The private key never leaves the server.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="release-signing-2026"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-type">Type</Label>
                <Select
                  value={form.key_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, key_type: v }))}
                >
                  <SelectTrigger id="key-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpg">GPG</SelectItem>
                    <SelectItem value="rsa">RSA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="uid-name">UID name (optional)</Label>
                  <Input
                    id="uid-name"
                    value={form.uid_name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, uid_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="uid-email">UID email (optional)</Label>
                  <Input
                    id="uid-email"
                    type="email"
                    value={form.uid_email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, uid_email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View public key */}
      <Dialog open={viewKey !== null} onOpenChange={(o) => !o && setViewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Public key — {viewKey?.name}</DialogTitle>
            <DialogDescription>Distribute this to verify signed artifacts.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {viewKey?.public_key_pem}
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton value={viewKey?.public_key_pem ?? ""} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={rotateTarget !== null}
        onOpenChange={(o) => !o && setRotateTarget(null)}
        title="Rotate signing key?"
        description={`A new key replaces "${rotateTarget?.name ?? ""}". Artifacts already signed stay valid; new signatures use the new key.`}
        confirmText="Rotate"
        loading={rotateMutation.isPending}
        onConfirm={() => rotateTarget && rotateMutation.mutate(rotateTarget.id)}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke signing key?"
        description={`"${revokeTarget?.name ?? ""}" will be marked revoked and can no longer sign artifacts.`}
        confirmText="Revoke"
        danger
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete signing key?"
        description={`"${deleteTarget?.name ?? ""}" will be permanently deleted. This cannot be undone.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
