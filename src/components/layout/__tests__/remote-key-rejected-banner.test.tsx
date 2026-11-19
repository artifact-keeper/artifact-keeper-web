// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

const authState = { remoteKeyRejected: false };
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => authState }));

const mockSwitch = vi.fn();
let active = { id: "remote-1", name: "Prod EU", url: "https://eu.example" };
vi.mock("@/providers/instance-provider", () => ({
  useInstance: () => ({ activeInstance: active, switchInstance: mockSwitch }),
}));

import { RemoteKeyRejectedBanner } from "../remote-key-rejected-banner";

afterEach(() => {
  cleanup();
  mockSwitch.mockReset();
  authState.remoteKeyRejected = false;
  active = { id: "remote-1", name: "Prod EU", url: "https://eu.example" };
});

describe("RemoteKeyRejectedBanner (#1227)", () => {
  it("renders nothing while the remote accepts its key", () => {
    const { container } = render(<RemoteKeyRejectedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the remote instance that rejected its key", () => {
    authState.remoteKeyRejected = true;
    render(<RemoteKeyRejectedBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The remote instance Prod EU rejected its API key"
    );
  });

  it("offers a way back to the local instance", () => {
    authState.remoteKeyRejected = true;
    render(<RemoteKeyRejectedBanner />);
    fireEvent.click(screen.getByText("switch back to Local"));
    expect(mockSwitch).toHaveBeenCalledWith("local");
  });

  it("renders nothing on the local instance", () => {
    authState.remoteKeyRejected = true;
    active = { id: "local", name: "Local", url: "" };
    const { container } = render(<RemoteKeyRejectedBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
