"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn, formatBytes } from "@/lib/utils";

interface FileUploadProps {
  onUpload: (file: File, path?: string) => Promise<void>;
  showPathInput?: boolean;
  accept?: string;
  className?: string;
}

export function FileUpload({
  onUpload,
  showPathInput = false,
  accept,
  className,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [customPath, setCustomPath] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setProgress(0);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setProgress(0);
    setCustomPath("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      await onUpload(file, customPath || undefined);
      handleClear();
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [file, customPath, onUpload, handleClear]);

  // Expose setProgress for parent to drive progress updates
  // (in practice, the parent's onUpload callback controls this)

  return (
    <div className={cn("space-y-4", className)}>
      {showPathInput && (
        <div className="space-y-2">
          <Label htmlFor="upload-path">Custom path (optional)</Label>
          <Input
            id="upload-path"
            placeholder="e.g. libs/mylib-1.0.jar"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            disabled={uploading}
          />
        </div>
      )}

      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          uploading && "pointer-events-none opacity-60"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={!file ? handleBrowse : undefined}
        role={!file ? "button" : undefined}
        tabIndex={!file ? 0 : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {file ? (
          <div className="flex items-center gap-3">
            <FileIcon className="size-5 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
            {!uploading && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground/60" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a single artifact file
              </p>
            </div>
          </>
        )}
      </div>

      {uploading && (
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-center">
            Uploading... {progress}%
          </p>
        </div>
      )}

      {file && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleClear} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      )}
    </div>
  );
}

