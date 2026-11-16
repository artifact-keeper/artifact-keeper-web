"use client";

import { ExternalLink } from "lucide-react";

import { isSafeUrl } from "@/lib/utils";

/**
 * A CI supplied URL (vcs_url, a metadata value) is only a link for http(s).
 * Anything else, `javascript:` and `data:` included, prints as text
 */
export function BuildUrl({ url }: { url: string }) {
  if (!isSafeUrl(url)) {
    return <span className="break-all">{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all text-blue-600 hover:underline dark:text-blue-400"
    >
      {url}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function metadataValue(value: unknown) {
  if (typeof value === "string") return <BuildUrl url={value} />;
  return <span className="break-all">{JSON.stringify(value)}</span>;
}

/** Build metadata as key/value rows, values as text or http(s) links */
export function BuildMetadata({
  metadata,
}: {
  metadata: Record<string, unknown> | undefined;
}) {
  if (metadata == null) return null;
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return (
      <p data-testid="build-metadata" className="break-all text-sm">
        {JSON.stringify(metadata)}
      </p>
    );
  }
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <dl
      data-testid="build-metadata"
      className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm"
    >
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="min-w-0">{metadataValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
