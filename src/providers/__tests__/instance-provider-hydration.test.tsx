// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

vi.mock("@/lib/sdk-client", () => ({}));
vi.mock("@artifact-keeper/sdk", () => ({
  createInstance: vi.fn(),
  deleteInstance: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  isValidInstanceUrl: (url: string) => url.startsWith("http"),
}));

import { InstanceProvider, useInstance } from "../instance-provider";

function Label() {
  const { activeInstance, instances } = useInstance();
  return (
    <span data-testid="label">
      {activeInstance.name}|{instances.length}
    </span>
  );
}

const app = (
  <InstanceProvider>
    <Label />
  </InstanceProvider>
);

const storage: Record<string, string> = {};

describe("InstanceProvider hydration (#829)", () => {
  let root: Root | null = null;

  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    // React reports act() support through this flag.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.unstubAllGlobals();
  });

  it("hydrates server HTML without a mismatch when a remote instance is active", async () => {
    // The server has no localStorage, so it renders the local instance.
    const serverHtml = renderToString(app);
    expect(serverHtml).toContain("Local");

    // The browser has a remote instance stored and active.
    storage["ak_instances"] = JSON.stringify([
      { id: "remote-1", name: "Remote One", url: "https://remote.example.com" },
    ]);
    storage["ak_active_instance"] = "remote-1";

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(container, app, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(
      consoleError.mock.calls.filter((c) => /hydrat/i.test(String(c[0])))
    ).toEqual([]);
    // After hydration the stored remote instance is shown.
    expect(container.textContent).toBe("Remote One|2");
    consoleError.mockRestore();
    container.remove();
  });
});
