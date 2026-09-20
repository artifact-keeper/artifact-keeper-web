import type { InstallScriptKind } from "@/types/package-analysis";

/**
 * Readable label per install-script `kind` (the backend's `ScriptKind`).
 * Each label names the ecosystem plus the hook as that ecosystem spells it,
 * because a card in an RPM repository reads better as "RPM %post" than as
 * "rpm-post". Same open-string convention as `scanTypeLabel`: an unknown
 * kind is returned unchanged rather than hidden or replaced.
 */
const INSTALL_SCRIPT_KIND_LABELS: Record<InstallScriptKind, string> = {
  "pre-link": "Conda pre-link",
  "post-link": "Conda post-link",
  "pre-unlink": "Conda pre-unlink",
  "post-unlink": "Conda post-unlink",
  preinstall: "npm preinstall",
  install: "npm install",
  postinstall: "npm postinstall",
  prepare: "npm prepare",
  "rpm-pre": "RPM %pre",
  "rpm-post": "RPM %post",
  "rpm-preun": "RPM %preun",
  "rpm-postun": "RPM %postun",
  "deb-preinst": "Debian preinst",
  "deb-postinst": "Debian postinst",
  "deb-prerm": "Debian prerm",
  "deb-postrm": "Debian postrm",
  "apk-pre-install": "Alpine pre-install",
  "apk-post-install": "Alpine post-install",
  "python-setup-py": "Python setup.py",
};

function isKnownInstallScriptKind(value: string): value is InstallScriptKind {
  return value in INSTALL_SCRIPT_KIND_LABELS;
}

/** Human-readable label for an install-script `kind`; unknown kinds verbatim. */
export function installScriptKindLabel(kind: string): string {
  return isKnownInstallScriptKind(kind) ? INSTALL_SCRIPT_KIND_LABELS[kind] : kind;
}

/**
 * Whether a hook of this kind runs with root privileges during a normal
 * install. RPM scriptlets, Debian maintainer scripts and Alpine apk triggers
 * execute as root under `dnf` / `apt` / `apk`; conda, npm and Python hooks
 * run as the invoking user. This is a privilege fact, not a severity: a root
 * hook with no findings is still just a root hook, but the same finding is
 * materially worse there. Matched by prefix so a new `rpm-*` / `deb-*` /
 * `apk-*` value from the backend is classified correctly before it is
 * modelled here.
 */
export function installScriptRunsAsRoot(kind: string): boolean {
  return kind.startsWith("rpm-") || kind.startsWith("deb-") || kind.startsWith("apk-");
}
