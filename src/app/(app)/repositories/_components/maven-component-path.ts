import type { MavenComponent } from "@/types";

/**
 * Reconstruct the repository-relative storage path for a single file within a
 * grouped Maven component.
 *
 * Maven layout is `groupId/artifactId/version/filename`, where `groupId`'s
 * dots map to path separators.  The grouped listing endpoint
 * (`?group_by=maven_component`) only returns bare filenames per component
 * (see backend `MavenComponentResponse.artifact_files`), so the web UI
 * rebuilds the full path here in order to open the artifact detail dialog and
 * fetch per-file metadata (issues #444, #445).
 *
 * @example
 *   mavenFilePath(
 *     { group_id: "org.example", artifact_id: "demo", version: "1.0.0", ... },
 *     "demo-1.0.0.zip",
 *   ) // => "org/example/demo/1.0.0/demo-1.0.0.zip"
 */
export function mavenFilePath(
  component: Pick<MavenComponent, "group_id" | "artifact_id" | "version">,
  filename: string,
): string {
  const groupPath = component.group_id.split(".").join("/");
  return `${groupPath}/${component.artifact_id}/${component.version}/${filename}`;
}
