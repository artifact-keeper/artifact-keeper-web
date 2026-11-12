// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

interface MutationConfig {
  mutationFn: (...a: unknown[]) => unknown;
  onSuccess?: (...a: unknown[]) => void;
  onError?: (...a: unknown[]) => void;
}
const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];

vi.mock("@tanstack/react-query", () => ({
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    const mutate = vi.fn();
    mutateFns.push(mutate);
    return { mutate, isPending: false };
  },
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

/** Query string the refusal link would have dropped the user in with. */
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));

const mockRequest = vi.fn();
vi.mock("@/lib/api/exceptions", () => ({
  EXCEPTION_GATES: ["age", "scan", "curation"],
  exceptionsApi: { request: (...a: unknown[]) => mockRequest(...a) },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const items: Array<{ value: string; label: string }> = [];
    let ariaLabel = "";
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<{
        "aria-label"?: string;
        children?: React.ReactNode;
      }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (sub) => {
        if (React.isValidElement(sub) && (sub.props as Record<string, unknown>).value) {
          const p = sub.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children, ...p }: { children: React.ReactNode }) => (
    <span {...p}>{children}</span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("lucide-react", () => {
  const icon = (name: string) => {
    const C = () => <span data-testid={`icon-${name}`} />;
    C.displayName = name;
    return C;
  };
  return {
    HelpCircle: icon("help"),
    Loader2: icon("loader"),
    CheckCircle2: icon("check"),
  };
});

import { ApiError } from "@/lib/api/fetch";
import RequestExceptionPage from "./page";

const lastMutate = () => mutateFns[mutateFns.length - 1];
const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Repository"), "npm-remote");
  await user.type(screen.getByLabelText("Package"), "leftpad-clone");
  await user.type(screen.getByLabelText(/Why do you need it/), "the build needs it");
};

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  search = new URLSearchParams();
});
afterEach(() => cleanup());

describe("prefill from a refusal link", () => {
  it("starts empty, on the scan gate, with nothing to send", () => {
    render(<RequestExceptionPage />);
    expect(screen.getByLabelText("Repository")).toHaveValue("");
    expect(screen.getByLabelText("Package")).toHaveValue("");
    expect(screen.getByLabelText("Version")).toHaveValue("");
    expect(screen.getByLabelText("Reason it is blocked")).toHaveValue("scan");
    expect(screen.getByRole("button", { name: /send request/i })).toBeDisabled();
  });

  it("fills the coordinate the refusal put in the query string", () => {
    // These are exactly the parameters the backend's refusal link builds.
    search = new URLSearchParams({
      repo: "npm-remote",
      package: "@scope/leftpad",
      version: "0.0.1",
      gate: "age",
    });
    render(<RequestExceptionPage />);
    expect(screen.getByLabelText("Repository")).toHaveValue("npm-remote");
    expect(screen.getByLabelText("Package")).toHaveValue("@scope/leftpad");
    expect(screen.getByLabelText("Version")).toHaveValue("0.0.1");
    expect(screen.getByLabelText("Reason it is blocked")).toHaveValue("age");
  });

  it("ignores a gate the backend does not model rather than sending it on", () => {
    search = new URLSearchParams({ gate: "javascript:alert(1)" });
    render(<RequestExceptionPage />);
    expect(screen.getByLabelText("Reason it is blocked")).toHaveValue("scan");
  });
});

describe("validation", () => {
  it("will not send without a repository, a package and a reason", async () => {
    const user = userEvent.setup();
    render(<RequestExceptionPage />);
    const send = screen.getByRole("button", { name: /send request/i });
    expect(send).toBeDisabled();
    expect(screen.getByText(/Fill in the repository, the package and why you need it/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Repository"), "npm-remote");
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Package"), "leftpad-clone");
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText(/Why do you need it/), "needed");
    expect(send).toBeEnabled();
  });

  it("treats whitespace-only input as empty", async () => {
    const user = userEvent.setup();
    render(<RequestExceptionPage />);
    await user.type(screen.getByLabelText("Repository"), "   ");
    await user.type(screen.getByLabelText("Package"), "   ");
    await user.type(screen.getByLabelText(/Why do you need it/), "   ");
    expect(screen.getByRole("button", { name: /send request/i })).toBeDisabled();
  });

  it("does not require a version, which asks about the whole package", async () => {
    const user = userEvent.setup();
    render(<RequestExceptionPage />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /send request/i }));
    expect(lastMutate()).toHaveBeenCalled();
  });
});

describe("submitting", () => {
  it("sends the coordinate, the gate and the justification", async () => {
    const user = userEvent.setup();
    render(<RequestExceptionPage />);
    await fill(user);
    await user.type(screen.getByLabelText("Version"), "0.0.1");
    await user.selectOptions(screen.getByLabelText("Reason it is blocked"), "curation");
    await mutationConfigs.at(-1)!.mutationFn();
    expect(mockRequest).toHaveBeenCalledWith({
      repositoryKey: "npm-remote",
      gate: "curation",
      packageName: "leftpad-clone",
      packageVersion: "0.0.1",
      justification: "the build needs it",
    });
  });

  it("confirms the request and says the package is still blocked", () => {
    render(<RequestExceptionPage />);
    act(() => mutationConfigs[0].onSuccess?.());
    expect(screen.getByText("Request sent")).toBeInTheDocument();
    // The asker has to know the grant has not happened yet, or they will go
    // straight back to a failing build and assume the form is broken.
    expect(screen.getByText(/You will still be blocked until someone grants/i)).toBeInTheDocument();
  });

  it("returns to the form to ask about another package", async () => {
    const user = userEvent.setup();
    render(<RequestExceptionPage />);
    act(() => mutationConfigs[0].onSuccess?.());
    await user.click(screen.getByRole("button", { name: /request another/i }));
    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
  });

  it("surfaces a refusal from the server", () => {
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.(new Error("API error 403: forbidden"));
    expect(mockToastError).toHaveBeenCalledWith("API error 403: forbidden");
  });

  it("names the missing feature instead of showing a bare 404", () => {
    // Every authenticated user sees the nav entry, so on a backend without
    // the queue this is the most-hit failure on the page.
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.(new ApiError(404, ""));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/does not accept exception requests yet/i),
    );
  });

  it("shows the backend's own 404 message, e.g. an unknown repository", () => {
    // `request_exception` answers 404 "Repository not found" for a key the
    // asker mistyped or cannot see. That is not a missing feature.
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.(
      new ApiError(404, JSON.stringify({ code: "NOT_FOUND", message: "Repository not found" })),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.not.stringMatching(/does not accept exception requests yet/i),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/Repository not found/),
    );
  });

  it("says the asker has hit the open-request cap on a 409", () => {
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.(
      new ApiError(
        409,
        JSON.stringify({ code: "CONFLICT", message: "You already have 50 open exception requests" }),
      ),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/already have 50 open exception requests\. Wait for a reviewer/),
    );
  });

  it("names the field the backend refused on a 400", () => {
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.(
      new ApiError(400, JSON.stringify({ code: "VALIDATION_ERROR", message: "Unknown gate: quarantine" })),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "The request was not accepted: Unknown gate: quarantine",
    );
  });

  it("treats a 404 from anything other than apiFetch as an ordinary error", () => {
    render(<RequestExceptionPage />);
    mutationConfigs[0].onError?.({ status: 404, message: "Not Found" });
    expect(mockToastError).toHaveBeenCalledWith("Not Found");
  });
});
