"use client";

import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, X, FileWarning, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { treeApi } from "@/lib/api/tree";
import {
  classifyContent,
  shikiLanguage,
  isLikelyText,
  hexDump,
} from "@/lib/content-type";
import { getHighlighter } from "@/lib/shiki";
import { formatBytes } from "@/lib/utils";
import type { ContentCategory } from "@/lib/content-type";

// Lazy-load react-markdown since it's a heavy dependency
const ReactMarkdown = lazy(() => import("react-markdown"));

const MAX_TEXT_BYTES = 102400; // 100 KB

// ---- Props ----

export interface FileViewerProps {
  repositoryKey: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
  onClose: () => void;
}

// ---- TruncationBanner ----

function TruncationBanner({
  shownBytes,
  totalBytes,
  downloadUrl,
}: {
  shownBytes: number;
  totalBytes: number;
  downloadUrl: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-b">
      <span>
        Showing first {formatBytes(shownBytes)} of {formatBytes(totalBytes)}
      </span>
      <a
        href={downloadUrl}
        className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
      >
        Download full file
      </a>
    </div>
  );
}

// ---- CodeRenderer ----

function CodeRenderer({
  data,
  fileName,
  truncated,
  totalSize,
  downloadUrl,
}: {
  data: ArrayBuffer;
  fileName: string;
  truncated: boolean;
  totalSize: number;
  downloadUrl: string;
}) {
  const text = useMemo(() => new TextDecoder().decode(data), [data]);
  const lang = useMemo(() => shikiLanguage(fileName), [fileName]);
  const [html, setHtml] = useState<string | null>(null);
  const [highlightError, setHighlightError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const result = highlighter.codeToHtml(text, {
          lang,
          themes: { dark: "github-dark", light: "github-light" },
        });
        setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHighlightError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [text, lang]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {truncated && (
        <TruncationBanner
          shownBytes={data.byteLength}
          totalBytes={totalSize}
          downloadUrl={downloadUrl}
        />
      )}
      <ScrollArea className="flex-1">
        {html && !highlightError ? (
          <div
            className="text-sm [&_pre]:p-4 [&_pre]:overflow-x-auto [&_code]:text-[13px] [&_code]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="p-4 text-sm overflow-x-auto">
            <code className="text-[13px] leading-relaxed whitespace-pre">
              {text}
            </code>
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}

// ---- MarkdownRenderer ----

function MarkdownRenderer({
  data,
  truncated,
  totalSize,
  downloadUrl,
}: {
  data: ArrayBuffer;
  truncated: boolean;
  totalSize: number;
  downloadUrl: string;
}) {
  const text = useMemo(() => new TextDecoder().decode(data), [data]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {truncated && (
        <TruncationBanner
          shownBytes={data.byteLength}
          totalBytes={totalSize}
          downloadUrl={downloadUrl}
        />
      )}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <Suspense
            fallback={
              <pre className="text-sm whitespace-pre-wrap">{text}</pre>
            }
          >
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          </Suspense>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- ImageRenderer ----

function ImageRenderer({ downloadUrl, fileName }: { downloadUrl: string; fileName: string }) {
  return (
    <ScrollArea className="flex-1">
      <div className="flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={downloadUrl}
          alt={fileName}
          className="max-w-full max-h-[60vh] object-contain"
        />
      </div>
    </ScrollArea>
  );
}

// ---- PdfRenderer ----

function PdfRenderer({ downloadUrl }: { downloadUrl: string }) {
  return (
    <div className="flex-1 p-4">
      <object
        data={downloadUrl}
        type="application/pdf"
        className="w-full h-[70vh]"
      >
        <p className="text-sm text-muted-foreground text-center py-8">
          Unable to display PDF inline.{" "}
          <a href={downloadUrl} className="underline underline-offset-2">
            Download the file
          </a>{" "}
          to view it.
        </p>
      </object>
    </div>
  );
}

// ---- BinaryRenderer ----

function BinaryRenderer({
  data,
  downloadUrl,
}: {
  data: ArrayBuffer;
  downloadUrl: string;
}) {
  const hex = useMemo(() => hexDump(data, 256), [data]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <FileWarning className="size-5" />
          <span className="text-sm">
            Binary file ({formatBytes(data.byteLength)})
          </span>
        </div>
        <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto leading-relaxed">
          {hex}
        </pre>
        <Button variant="outline" size="sm" asChild>
          <a href={downloadUrl}>
            <Download />
            Download
          </a>
        </Button>
      </div>
    </ScrollArea>
  );
}

// ---- FileViewer ----

export function FileViewer({
  repositoryKey,
  filePath,
  fileName,
  fileSize,
  onClose,
}: FileViewerProps) {
  const downloadUrl = `/api/v1/repositories/${repositoryKey}/download/${filePath}`;

  const category = useMemo(
    () => classifyContent(fileName),
    [fileName]
  );

  const isTextCategory = category === "code" || category === "markdown";

  const shouldTruncate =
    isTextCategory && fileSize != null && fileSize > MAX_TEXT_BYTES;

  // Skip fetching for PDFs (rendered via download URL) and images (also via URL)
  const skipFetch = category === "pdf" || category === "image";

  const { data: content, isLoading, isError } = useQuery({
    queryKey: ["file-content", repositoryKey, filePath],
    queryFn: () =>
      treeApi.getContent({
        repository_key: repositoryKey,
        path: filePath,
        ...(shouldTruncate ? { max_bytes: MAX_TEXT_BYTES } : {}),
      }),
    enabled: !skipFetch,
  });

  // Resolve effective category: if classified as "binary" but the content
  // looks like text, treat it as code instead.
  const effectiveCategory: ContentCategory = useMemo(() => {
    if (category === "binary" && content?.data && isLikelyText(content.data)) {
      return "code";
    }
    return category;
  }, [category, content?.data]);

  const isTruncated =
    content != null &&
    content.totalSize > 0 &&
    content.data.byteLength < content.totalSize;

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {fileName}
        </span>
        {fileSize != null && (
          <span className="text-xs text-muted-foreground shrink-0">
            {formatBytes(fileSize)}
          </span>
        )}
        <Button variant="ghost" size="icon-xs" asChild>
          <a href={downloadUrl} title="Download">
            <Download className="size-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          title="Close"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Content area */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading file...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <FileWarning className="size-6 text-destructive" />
          <span className="text-sm text-muted-foreground">
            Failed to load file content
          </span>
        </div>
      )}

      {content && effectiveCategory === "code" && (
        <CodeRenderer
          data={content.data}
          fileName={fileName}
          truncated={isTruncated}
          totalSize={content.totalSize}
          downloadUrl={downloadUrl}
        />
      )}

      {content && effectiveCategory === "markdown" && (
        <MarkdownRenderer
          data={content.data}
          truncated={isTruncated}
          totalSize={content.totalSize}
          downloadUrl={downloadUrl}
        />
      )}

      {effectiveCategory === "image" && (
        <ImageRenderer downloadUrl={downloadUrl} fileName={fileName} />
      )}

      {effectiveCategory === "pdf" && (
        <PdfRenderer downloadUrl={downloadUrl} />
      )}

      {content && effectiveCategory === "binary" && (
        <BinaryRenderer data={content.data} downloadUrl={downloadUrl} />
      )}
    </div>
  );
}
