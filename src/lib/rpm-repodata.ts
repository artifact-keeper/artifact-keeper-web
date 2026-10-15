export interface RpmRepodataCapabilities {
  supported: true;
  min: number;
  max: number;
  default: number;
}

export function supportsRpmRepodataDepth(format: string, repoType: string): boolean {
  return format === "rpm" && repoType === "local";
}

export function parseRepodataDepth(
  value: string,
  bounds: Pick<RpmRepodataCapabilities, "min" | "max">,
): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const depth = Number(value);
  return Number.isSafeInteger(depth) && depth >= bounds.min && depth <= bounds.max
    ? depth
    : null;
}

/** Long layouts use an explicitly illustrative placeholder, not a runnable path. */
export function repodataRootExample(depth: number): string {
  if (depth === 0) return "";
  if (depth === 1) return "build-a";
  if (depth === 2) return "build-a/x86_64";
  return `<root-with-${depth}-directories>`;
}

export function validateRepodataUploadPath(path: string, depth: number): string | undefined {
  if (depth === 0) return undefined;
  const segments = path.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    path.startsWith("/") ||
    path.includes("\\")
  ) {
    return "Enter a complete relative artifact path with nonempty directories and a filename.";
  }
  if (segments.length - 1 < depth) {
    return `Repodata Depth ${depth} requires at least ${depth} directories before the filename.`;
  }
  return undefined;
}
