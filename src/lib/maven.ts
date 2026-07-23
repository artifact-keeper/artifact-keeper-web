/**
 * Maven coordinate helpers shared by the search UI (issue #441) and the
 * repository browser / artifact detail view (issue #442).
 *
 * Maven artifacts are addressed by GAV coordinates: groupId, artifactId,
 * version, plus an optional classifier and a file extension. On disk and in
 * the registry, a component lives under a path derived from those
 * coordinates:
 *
 *   <groupId with dots replaced by slashes>/<artifactId>/<version>/<filename>
 *
 * e.g. org.junit.jupiter:junit-jupiter-api:5.11.0 (jar) maps to
 *   org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar
 */

/** The GAV-style fields a user can search Maven artifacts by. */
export interface MavenGavcQuery {
  groupId?: string;
  artifactId?: string;
  version?: string;
  classifier?: string;
  /** File extension such as `jar`, `pom`, `war` (with or without a leading dot). */
  extension?: string;
}

/**
 * Build a full-text query string from GAV/classifier/extension fields.
 *
 * The backend advanced-search endpoint matches a single `query` string against
 * a text vector built from each artifact's name, path, and version. Maven
 * coordinates are encoded in the path (dotted groupIds become path segments,
 * which the tokenizer splits the same way it splits the dotted form), so
 * feeding the coordinates in as space-separated terms lets the full-text
 * search prefix-match every supplied component. Empty fields are skipped, and
 * a leading dot on the extension is stripped so `.jar` and `jar` behave the
 * same.
 */
export function buildMavenSearchQuery(q: MavenGavcQuery): string {
  const terms: string[] = [];
  const push = (raw: string | undefined) => {
    const value = raw?.trim();
    if (value) terms.push(value);
  };

  push(q.groupId);
  push(q.artifactId);
  push(q.version);
  push(q.classifier);

  const ext = q.extension?.trim().replace(/^\.+/, "");
  if (ext) terms.push(ext);

  return terms.join(" ");
}

/**
 * Convert a Maven groupId into its path form (dots become slashes).
 *
 *   org.junit.jupiter -> org/junit/jupiter
 */
export function groupIdToPath(groupId: string): string {
  return groupId.split(".").filter(Boolean).join("/");
}

/**
 * Build the repository-relative download path for a single file belonging to a
 * Maven component. The filename already carries the artifactId, version, and
 * classifier (e.g. `junit-jupiter-api-5.11.0-sources.jar`), so we only need to
 * prefix the GAV directory layout.
 */
export function mavenFilePath(
  component: { group_id: string; artifact_id: string; version: string },
  filename: string,
): string {
  return [
    groupIdToPath(component.group_id),
    component.artifact_id,
    component.version,
    filename,
  ]
    .filter(Boolean)
    .join("/");
}

/** True when a filename is the Maven POM for a component (not a checksum/sig). */
export function isPomFile(filename: string): boolean {
  return /\.pom$/i.test(filename);
}

/**
 * Find the POM filename within a component's file list, if present. POM
 * checksum and signature files (`.pom.sha1`, `.pom.asc`, …) are ignored.
 */
export function findPomFile(filenames: string[]): string | undefined {
  return filenames.find(isPomFile);
}

/**
 * Parse GAV coordinates out of a Maven artifact path. Returns `undefined` when
 * the path does not look like a Maven layout (fewer than four segments). The
 * version is the second-to-last segment and the artifactId the one before it;
 * everything earlier is the dotted groupId.
 *
 *   org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar
 *     -> { groupId: org.junit.jupiter, artifactId: junit-jupiter-api, version: 5.11.0 }
 */
export function parseMavenGav(
  path: string,
): { groupId: string; artifactId: string; version: string } | undefined {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 4) return undefined;
  // Last segment is the filename; the two before it are version and artifactId.
  const version = segments[segments.length - 2];
  const artifactId = segments[segments.length - 3];
  const groupId = segments.slice(0, segments.length - 3).join(".");
  if (!groupId || !artifactId || !version) return undefined;
  return { groupId, artifactId, version };
}

/**
 * Render a copy/paste-ready `<dependency>` snippet for a pom.xml. Used in the
 * artifact detail view so users can drop a Maven coordinate straight into
 * their build (issue #442).
 */
export function buildPomDependencySnippet(gav: {
  groupId: string;
  artifactId: string;
  version: string;
}): string {
  return [
    "<dependency>",
    `  <groupId>${gav.groupId}</groupId>`,
    `  <artifactId>${gav.artifactId}</artifactId>`,
    `  <version>${gav.version}</version>`,
    "</dependency>",
  ].join("\n");
}
