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
 * coordinates are encoded in the path, where the tokenizer splits on `/` —
 * so a dotted groupId is stored as *separate* lexemes (`org`, `junit`,
 * `jupiter`), and pushing the dotted form as one term never matches (#475).
 * The groupId is therefore split on `.` into separate AND-ed terms; the
 * remaining fields go in as-is. Empty fields are skipped, and a leading dot
 * on the extension is stripped so `.jar` and `jar` behave the same.
 */
export function buildMavenSearchQuery(q: MavenGavcQuery): string {
  const terms: string[] = [];
  const push = (raw: string | undefined) => {
    const value = raw?.trim();
    if (value) terms.push(value);
  };

  for (const segment of q.groupId?.trim().split(".") ?? []) {
    push(segment);
  }
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
 * Full Maven coordinates for one file: the GAV plus the optional classifier
 * and the file extension (GAVC).
 */
export interface MavenGavc {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
  extension?: string;
}

/**
 * Split a Maven filename into its classifier and extension, given the
 * artifactId and version it was deployed under (issue #482).
 *
 * Maven filenames follow `<artifactId>-<version>[-<classifier>].<ext>`, so
 * once the known `<artifactId>-<version>` prefix is stripped, whatever
 * remains before the first dot is the classifier and everything after it is
 * the extension. Keeping the whole tail as the extension handles the two
 * gotchas called out in the issue:
 *
 * - compound extensions: `lib-1.0.tar.gz`        -> extension `tar.gz`
 * - signature/checksum files: `lib-1.0.jar.asc`  -> extension `jar.asc`
 *   (the `.asc`/`.sha256`/… suffix extends the extension; it is never a
 *   classifier)
 *
 * Returns `undefined` when the filename does not start with the expected
 * prefix (e.g. a timestamped snapshot filename against a `-SNAPSHOT`
 * version, or a non-Maven file).
 */
export function parseMavenFilename(
  filename: string,
  artifactId: string,
  version: string,
): { classifier?: string; extension: string } | undefined {
  const prefix = `${artifactId}-${version}`;
  if (!filename.startsWith(prefix)) return undefined;
  const rest = filename.slice(prefix.length);

  if (rest.startsWith(".")) {
    const extension = rest.slice(1);
    return extension ? { extension } : undefined;
  }
  if (rest.startsWith("-")) {
    const dot = rest.indexOf(".");
    const classifier = rest.slice(1, dot === -1 ? rest.length : dot);
    const extension = dot === -1 ? "" : rest.slice(dot + 1);
    if (!classifier || !extension) return undefined;
    return { classifier, extension };
  }
  return undefined;
}

/**
 * Parse GAV coordinates out of a Maven artifact path. Returns `undefined` when
 * the path does not look like a Maven layout (fewer than four segments). The
 * version is the second-to-last segment and the artifactId the one before it;
 * everything earlier is the dotted groupId. The classifier and extension are
 * recovered from the filename via `parseMavenFilename` when it matches the
 * `<artifactId>-<version>` prefix (#482).
 *
 *   org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar
 *     -> { groupId: org.junit.jupiter, artifactId: junit-jupiter-api, version: 5.11.0, extension: jar }
 */
export function parseMavenGav(path: string): MavenGavc | undefined {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 4) return undefined;
  // Last segment is the filename; the two before it are version and artifactId.
  const filename = segments[segments.length - 1];
  const version = segments[segments.length - 2];
  const artifactId = segments[segments.length - 3];
  const groupId = segments.slice(0, segments.length - 3).join(".");
  if (!groupId || !artifactId || !version) return undefined;
  return { groupId, artifactId, version, ...parseMavenFilename(filename, artifactId, version) };
}

/**
 * Read the GAVC coordinates the backend parsed at upload time out of
 * `artifact.metadata` (`groupId`/`artifactId`/`version`/`extension`/
 * `classifier`). Preferring this over re-parsing the path in the UI is the
 * fix called for in #482; callers should fall back to `parseMavenGav` when
 * the backend stored nothing (older server, non-Maven upload path).
 */
export function mavenGavcFromMetadata(
  metadata: Record<string, unknown> | undefined,
): MavenGavc | undefined {
  if (!metadata) return undefined;
  const { groupId, artifactId, version, classifier, extension } = metadata;
  if (
    typeof groupId !== "string" || !groupId ||
    typeof artifactId !== "string" || !artifactId ||
    typeof version !== "string" || !version
  ) {
    return undefined;
  }
  return {
    groupId,
    artifactId,
    version,
    ...(typeof classifier === "string" && classifier ? { classifier } : {}),
    ...(typeof extension === "string" && extension ? { extension } : {}),
  };
}

/**
 * Split a registry package name into Maven coordinates.
 *
 * The backend stores Maven packages under the colon-joined name
 * `groupId:artifactId` (the version lives in a separate column), and a full
 * coordinate may also carry a trailing `:version` segment. Colons are the
 * coordinate delimiter and are not legal inside a groupId or artifactId, so
 * the split is on colons — never on dots: a groupId contains dots
 * (`com.acme.sub`) and an artifactId may too (`bar.baz`), so dot-based
 * heuristics mis-split real coordinates.
 *
 *   com.example.team:team-spring-archetype -> { groupId: com.example.team, artifactId: team-spring-archetype }
 *   com.acme.sub:my-artifact:1.0       -> { groupId: com.acme.sub, artifactId: my-artifact, version: 1.0 }
 *   plain-name                         -> { artifactId: plain-name }
 */
export function parseMavenPackageName(name: string): {
  groupId?: string;
  artifactId: string;
  version?: string;
} {
  const parts = name.split(":");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { artifactId: name };
  }
  return {
    groupId: parts[0],
    artifactId: parts[1],
    version: parts.length > 2 && parts[2] ? parts[2] : undefined,
  };
}

/**
 * Render a copy/paste-ready `<dependency>` snippet for a pom.xml. Used in the
 * artifact detail view so users can drop a Maven coordinate straight into
 * their build (issue #442). The optional classifier is included when known
 * (#482) — a classified artifact (sources, javadoc, native builds, …) cannot
 * be depended on without it.
 */
export function buildPomDependencySnippet(gav: {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
}): string {
  return [
    "<dependency>",
    `  <groupId>${gav.groupId}</groupId>`,
    `  <artifactId>${gav.artifactId}</artifactId>`,
    `  <version>${gav.version}</version>`,
    ...(gav.classifier ? [`  <classifier>${gav.classifier}</classifier>`] : []),
    "</dependency>",
  ].join("\n");
}
