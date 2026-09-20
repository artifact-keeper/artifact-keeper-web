/**
 * What the sidebar and settings page print for the web build.
 *
 * A release is a build made from a release tag: the Docker build arg
 * APP_VERSION (CI passes the git ref that triggered the build, so a
 * release is `vX.Y.Z`) reaches the bundle as NEXT_PUBLIC_BUILD_REF. Such a
 * build shows its version. Anything else — `main`, a branch, `dev`, a
 * `-dev` suffix — is not the version package.json claims, so it shows the
 * short commit hash instead, with the version and ref in the tooltip.
 *
 * Without a build ref (local `next dev`, older images) the previous rule
 * applies: a prerelease version shows its hash alongside.
 */
export const RELEASE_TAG_RE = /^v?\d+\.\d+\.\d+$/;

export interface BuildLabel {
  /** Text to show, e.g. `1.9.0` or `9801123`. */
  label: string;
  /** Tooltip with the full story, e.g. `main build 9801123a… (package version 1.9.0)`. */
  title: string;
  /** Whether this is a release build. */
  release: boolean;
}

export function isReleaseRef(ref: string | undefined): boolean {
  return !!ref && RELEASE_TAG_RE.test(ref.trim());
}

export function shortSha(sha: string | undefined): string | null {
  if (!sha || sha === "unknown") return null;
  return sha.slice(0, 7);
}

export function webBuildLabel(
  version: string | undefined,
  sha: string | undefined,
  ref: string | undefined,
): BuildLabel {
  const v = version || "dev";
  const short = shortSha(sha);
  if (ref !== undefined && ref !== "") {
    if (isReleaseRef(ref)) {
      return { label: v, title: `release ${ref}`, release: true };
    }
    if (short) {
      return {
        label: short,
        title: `${ref} build ${sha} (package version ${v})`,
        release: false,
      };
    }
    return { label: `${v} (${ref})`, title: `${ref} build (package version ${v})`, release: false };
  }
  // No build ref: the version is all we know, plus the hash for prereleases.
  if (v.includes("-") && short) {
    return { label: `${v} (${short})`, title: `prerelease ${v}, commit ${sha}`, release: false };
  }
  return { label: v, title: `version ${v}`, release: !v.includes("-") };
}

/** The label for the current bundle, from the build-time environment. */
export function currentWebBuildLabel(): BuildLabel {
  return webBuildLabel(
    process.env.NEXT_PUBLIC_APP_VERSION,
    process.env.NEXT_PUBLIC_GIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_REF,
  );
}
