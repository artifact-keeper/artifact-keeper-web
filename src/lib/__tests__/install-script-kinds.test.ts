import { describe, it, expect } from "vitest";
import { installScriptKindLabel, installScriptRunsAsRoot } from "../install-script-kinds";

describe("installScriptKindLabel", () => {
  it.each([
    ["pre-link", "Conda pre-link"],
    ["post-link", "Conda post-link"],
    ["pre-unlink", "Conda pre-unlink"],
    ["preinstall", "npm preinstall"],
    ["install", "npm install"],
    ["postinstall", "npm postinstall"],
    ["prepare", "npm prepare"],
    ["rpm-pre", "RPM %pre"],
    ["rpm-post", "RPM %post"],
    ["rpm-preun", "RPM %preun"],
    ["rpm-postun", "RPM %postun"],
    ["deb-preinst", "Debian preinst"],
    ["deb-postinst", "Debian postinst"],
    ["deb-prerm", "Debian prerm"],
    ["deb-postrm", "Debian postrm"],
    ["apk-pre-install", "Alpine pre-install"],
    ["apk-post-install", "Alpine post-install"],
    ["python-setup-py", "Python setup.py"],
  ])("labels %s as %s", (kind, label) => {
    expect(installScriptKindLabel(kind)).toBe(label);
  });

  it("returns an unknown kind verbatim rather than hiding it", () => {
    expect(installScriptKindLabel("pre-activate")).toBe("pre-activate");
    expect(installScriptKindLabel("")).toBe("");
  });
});

describe("installScriptRunsAsRoot", () => {
  it("is true for the RPM / Debian / Alpine families", () => {
    for (const k of [
      "rpm-pre",
      "rpm-post",
      "rpm-preun",
      "rpm-postun",
      "deb-preinst",
      "deb-postinst",
      "deb-prerm",
      "deb-postrm",
      "apk-pre-install",
      "apk-post-install",
    ]) {
      expect(installScriptRunsAsRoot(k), k).toBe(true);
    }
  });

  it("classifies a not-yet-modelled member of a root family by prefix", () => {
    expect(installScriptRunsAsRoot("rpm-posttrans")).toBe(true);
    expect(installScriptRunsAsRoot("deb-config")).toBe(true);
  });

  it("is false for user-privilege hooks and unknown kinds", () => {
    for (const k of [
      "pre-link",
      "post-link",
      "pre-unlink",
      "preinstall",
      "install",
      "postinstall",
      "prepare",
      "python-setup-py",
      "pre-activate",
      "rpm",
      "debian",
    ]) {
      expect(installScriptRunsAsRoot(k), k).toBe(false);
    }
  });
});
