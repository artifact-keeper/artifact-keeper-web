"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { environmentsApi, type EnvironmentSbom } from "@/lib/api/environments";
import { triggerBrowserDownload } from "@/lib/download";
import { mutationErrorToast } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** File name for one scope's SBOM download, e.g. `pixi.lock.default.linux-64.cdx.json`. */
export function sbomFileName(sbom: EnvironmentSbom, environment?: string, platform?: string): string {
  const ext = sbom.sbomFormat === "spdx" ? "spdx.json" : "cdx.json";
  return [sbom.lockfile, environment, platform, ext].filter(Boolean).join(".");
}

/**
 * Lockfile tools on the Environments tab (#912): render a lockfile as SBOM
 * documents (one per environment and platform, downloaded as JSON) and, for
 * users who may write to the repository, register it as a stored environment
 * so the package lookup can find it.
 */
export function EnvironmentLockfileTools({
  repoKey,
  canRegister,
}: {
  repoKey: string;
  canRegister: boolean;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"cyclonedx" | "spdx">("cyclonedx");
  const [sbom, setSbom] = useState<EnvironmentSbom | null>(null);

  const generate = useMutation({
    mutationFn: async () => environmentsApi.generateSbom(file!.name, await file!.text(), format),
    onSuccess: (r) => setSbom(r),
    onError: mutationErrorToast("Could not generate the SBOM"),
  });

  const register = useMutation({
    mutationFn: async () =>
      environmentsApi.register(repoKey, file!.name, await file!.text(), name.trim() || undefined),
    onSuccess: (r) => {
      toast.success(r.replaced ? "Environment replaced" : "Environment registered");
      queryClient.invalidateQueries({ queryKey: ["environments", repoKey] });
    },
    onError: mutationErrorToast("Could not register the environment"),
  });

  return (
    <section className="space-y-3" data-testid="environment-lockfile-tools">
      <div>
        <h3 className="text-sm font-medium">Lockfile</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          pixi.lock, conda-lock.yml, package-lock.json, Cargo.lock, poetry.lock or
          uv.lock. Generate SBOMs from it (nothing is stored), or register it as an
          environment of {repoKey}.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="env-lockfile">File</Label>
          <Input
            id="env-lockfile"
            type="file"
            className="text-xs"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSbom(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="env-sbom-format">SBOM format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as "cyclonedx" | "spdx")}>
            <SelectTrigger id="env-sbom-format" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cyclonedx">CycloneDX</SelectItem>
              <SelectItem value="spdx">SPDX</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={!file || generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Generate SBOM
        </Button>
        {canRegister && (
          <>
            <div className="space-y-1">
              <Label htmlFor="env-name">Environment name</Label>
              <Input
                id="env-name"
                placeholder="defaults to the file name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-56"
              />
            </div>
            <Button disabled={!file || register.isPending} onClick={() => register.mutate()}>
              {register.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              Register environment
            </Button>
          </>
        )}
      </div>
      {sbom && (
        <div className="rounded-md border p-3 space-y-2" data-testid="environment-sbom-result">
          <p className="text-xs text-muted-foreground">
            {sbom.graphs.length} {sbom.sbomFormat === "spdx" ? "SPDX" : "CycloneDX"} document
            {sbom.graphs.length === 1 ? "" : "s"} from {sbom.lockfile}
            {sbom.distinctPackages !== undefined && `, ${sbom.distinctPackages} distinct packages`}
          </p>
          <ul className="flex flex-wrap gap-2">
            {sbom.graphs.map((g, i) => (
              <li key={`${g.environment}-${g.platform}-${i}`}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    triggerBrowserDownload(
                      sbomFileName(sbom, g.environment, g.platform),
                      JSON.stringify(g.document, null, 2),
                      "application/json",
                    )
                  }
                >
                  <Download className="size-3.5" />
                  {g.environment ?? "default"} / {g.platform ?? "all"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
