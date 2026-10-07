"use client";

import { condaPackageFields } from "@/lib/conda";
import { readPublisher } from "@/lib/attestation";
import { PublisherBadge } from "@/components/package/publisher-badge";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <span className="text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

/**
 * Conda package fields in the artifact detail dialog: the `index.json` values
 * a reviewer checks (platform subdir, build, license, run dependencies) and
 * who uploaded it, instead of leaving them inside the raw metadata dump.
 */
export function CondaPackageSection({
  path,
  metadata,
  uploadedBy,
}: {
  path: string;
  metadata: Record<string, unknown> | null | undefined;
  uploadedBy?: string | null;
}) {
  const f = condaPackageFields(path, metadata);
  const publisher = readPublisher(metadata);
  return (
    <div className="space-y-3" data-testid="conda-package">
      <p className="text-xs font-medium text-muted-foreground">Conda package</p>
      {f.subdir && (
        <Row label="Subdir">
          <span className="font-mono text-xs">{f.subdir}</span>
        </Row>
      )}
      {f.build && (
        <Row label="Build">
          <span className="font-mono text-xs">
            {f.build}
            {f.buildNumber !== undefined && (
              <span className="text-muted-foreground"> (number {f.buildNumber})</span>
            )}
          </span>
        </Row>
      )}
      <Row label="Publisher">
        {publisher ? (
          <PublisherBadge publisher={publisher} />
        ) : (
          <span className="text-muted-foreground">not declared</span>
        )}
      </Row>
      <Row label="License">
        {f.license ?? <span className="text-muted-foreground">not declared</span>}
      </Row>
      <Row label="Depends">
        {f.depends.length === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {f.depends.map((d) => (
              <li key={d}>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{d}</code>
              </li>
            ))}
          </ul>
        )}
      </Row>
      {uploadedBy && <Row label="Uploaded by">{uploadedBy}</Row>}
    </div>
  );
}
