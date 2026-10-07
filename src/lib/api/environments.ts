import { apiFetch } from '@/lib/api/fetch';

/**
 * Stored environments (registered lockfiles) and the component -> environment
 * reverse index (backend artifact-keeper#4054, 1.11.0). Not in the generated
 * SDK yet, so these go through `apiFetch`; the backend returns camelCase JSON
 * objects (`handlers/environments.rs`), adapted here with tolerant parsing so
 * a field the backend renames degrades to "unknown" instead of throwing.
 */

export interface StoredEnvironment {
  id: string;
  name: string;
  lockfileFormat?: string;
  contentSha256?: string;
  /** Distinct packages across all scopes, from the stored ingest summary. */
  distinctPackages?: number;
  /** Number of (environment, platform) scopes in the lockfile. */
  scopes?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EnvironmentHit {
  environment: { id: string; name: string };
  repository: { id?: string; key: string };
  scope: { environment?: string; platform?: string };
  package: { name: string; version?: string; purl?: string };
  /** Inclusion chains from a root down to the component, `name@version`. */
  paths: string[][];
}

export interface EnvironmentLookup {
  purl: string;
  purlBase?: string;
  truncated: boolean;
  hits: EnvironmentHit[];
}

/**
 * One advisory affectedness transition (backend artifact-keeper#4055): an
 * environment BECAME or CEASED to be affected by an advisory as the advisory
 * data changed.
 */
export interface AdvisoryTransition {
  environment: { id: string; name: string };
  repository: { id?: string; key: string };
  advisory: {
    id: string;
    summary?: string;
    severity?: string;
    fixedVersion?: string;
    sourceUrl?: string;
  };
  package: { ecosystem?: string; name: string; version?: string };
  /** `new-affected` or `no-longer-affected`; anything else is kept raw. */
  kind: string;
  detectedAt?: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export function adaptEnvironment(raw: unknown): StoredEnvironment | null {
  const r = obj(raw);
  const id = str(r.id);
  const name = str(r.name);
  if (!id || !name) return null;
  const summary = obj(r.summary);
  const scopes = summary.scopes;
  return {
    id,
    name,
    lockfileFormat: str(r.lockfileFormat),
    contentSha256: str(r.contentSha256),
    distinctPackages: num(summary.distinctPackages),
    scopes: Array.isArray(scopes) ? scopes.length : num(scopes),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

export function adaptLookup(raw: unknown, purl: string): EnvironmentLookup {
  const r = obj(raw);
  const q = obj(r.query);
  const hits: EnvironmentHit[] = [];
  for (const h of Array.isArray(r.hits) ? r.hits : []) {
    const hit = obj(h);
    const env = obj(hit.environment);
    const repo = obj(hit.repository);
    const pkg = obj(hit.package);
    const scope = obj(hit.scope);
    const envId = str(env.id);
    const envName = str(env.name);
    const repoKey = str(repo.key);
    const pkgName = str(pkg.name);
    if (!envId || !envName || !repoKey || !pkgName) continue;
    hits.push({
      environment: { id: envId, name: envName },
      repository: { id: str(repo.id), key: repoKey },
      scope: { environment: str(scope.environment), platform: str(scope.platform) },
      package: { name: pkgName, version: str(pkg.version), purl: str(pkg.purl) },
      paths: Array.isArray(hit.paths)
        ? hit.paths
            .filter(Array.isArray)
            .map((p) => (p as unknown[]).filter((s): s is string => typeof s === 'string'))
        : [],
    });
  }
  return {
    purl: str(q.purl) ?? purl,
    purlBase: str(q.purlBase),
    truncated: r.truncated === true,
    hits,
  };
}

export interface EnvironmentSbomGraph {
  environment?: string;
  platform?: string;
  /** The complete CycloneDX or SPDX document for this scope. */
  document: unknown;
}

export interface EnvironmentSbom {
  lockfile: string;
  lockfileFormat?: string;
  sbomFormat: string;
  graphs: EnvironmentSbomGraph[];
  distinctPackages?: number;
}

export function adaptEnvironmentSbom(raw: unknown, filename: string): EnvironmentSbom {
  const r = obj(raw);
  const graphs: EnvironmentSbomGraph[] = [];
  for (const g of Array.isArray(r.graphs) ? r.graphs : []) {
    const o = obj(g);
    if (o.document === undefined) continue;
    graphs.push({ environment: str(o.environment), platform: str(o.platform), document: o.document });
  }
  return {
    lockfile: str(r.lockfile) ?? filename,
    lockfileFormat: str(r.lockfileFormat),
    sbomFormat: str(r.sbomFormat) ?? 'cyclonedx',
    graphs,
    distinctPackages: num(obj(r.summary).distinctPackages),
  };
}

const RAW = { headers: { 'Content-Type': 'application/octet-stream' } };

export function adaptTransitions(raw: unknown): AdvisoryTransition[] {
  const list = obj(raw).transitions;
  const out: AdvisoryTransition[] = [];
  for (const t of Array.isArray(list) ? list : []) {
    const r = obj(t);
    const env = obj(r.environment);
    const repo = obj(r.repository);
    const adv = obj(r.advisory);
    const pkg = obj(r.package);
    const envId = str(env.id);
    const envName = str(env.name);
    const repoKey = str(repo.key);
    const advId = str(adv.id);
    const pkgName = str(pkg.name);
    const kind = str(r.kind);
    if (!envId || !envName || !repoKey || !advId || !pkgName || !kind) continue;
    out.push({
      environment: { id: envId, name: envName },
      repository: { id: str(repo.id), key: repoKey },
      advisory: {
        id: advId,
        summary: str(adv.summary),
        severity: str(adv.severity),
        fixedVersion: str(adv.fixedVersion),
        sourceUrl: str(adv.sourceUrl),
      },
      package: { ecosystem: str(pkg.ecosystem), name: pkgName, version: str(pkg.version) },
      kind,
      detectedAt: str(r.detectedAt),
    });
  }
  return out;
}

export const environmentsApi = {
  /**
   * Render a lockfile as SBOM documents, one per (environment, platform)
   * scope (`POST /api/v1/sbom/environment`, artifact-keeper#4053/#4128).
   * Nothing is stored.
   */
  generateSbom: async (
    filename: string,
    content: string,
    format: 'cyclonedx' | 'spdx',
  ): Promise<EnvironmentSbom> => {
    const q = `filename=${encodeURIComponent(filename)}&format=${format}`;
    const data = await apiFetch<unknown>(`/api/v1/sbom/environment?${q}`, {
      method: 'POST',
      body: content,
      ...RAW,
    });
    return adaptEnvironmentSbom(data, filename);
  },

  /**
   * Store a lockfile as a named environment of the repository (repo write
   * permission); re-registering a name replaces its graph.
   */
  register: async (
    repoKey: string,
    filename: string,
    content: string,
    name?: string,
  ): Promise<{ id?: string; replaced: boolean }> => {
    const q = `filename=${encodeURIComponent(filename)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
    const data = obj(
      await apiFetch<unknown>(
        `/api/v1/repositories/${encodeURIComponent(repoKey)}/environments?${q}`,
        { method: 'POST', body: content, ...RAW },
      ),
    );
    return { id: str(data.id), replaced: data.replaced === true };
  },

  list: async (repoKey: string): Promise<StoredEnvironment[]> => {
    const data = await apiFetch<unknown>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/environments`,
    );
    const list = obj(data).environments;
    return (Array.isArray(list) ? list : [])
      .map(adaptEnvironment)
      .filter((e): e is StoredEnvironment => e !== null);
  },

  /**
   * Advisory affectedness transitions across every environment the caller
   * can read, newest first (`GET /api/v1/environments/advisory-transitions`).
   */
  transitions: async (limit = 100): Promise<AdvisoryTransition[]> =>
    adaptTransitions(
      await apiFetch<unknown>(`/api/v1/environments/advisory-transitions?limit=${limit}`),
    ),

  lookup: async (purl: string): Promise<EnvironmentLookup> => {
    const data = await apiFetch<unknown>(
      `/api/v1/environments/lookup?purl=${encodeURIComponent(purl)}`,
    );
    return adaptLookup(data, purl);
  },
};
