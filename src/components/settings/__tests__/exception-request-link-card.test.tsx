// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
  CSRF_HEADER_NAME: "X-Requested-With",
  CSRF_HEADER_VALUE: "XMLHttpRequest",
}));

let settings: { exceptionRequestUrl?: string | null } | undefined;
vi.mock("@/hooks/use-admin-settings", () => ({
  ADMIN_SETTINGS_QUERY_KEY: ["admin-settings"],
  useAdminSettings: () => ({ data: settings }),
}));

const mockUpdate = vi.fn();
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    updateExceptionRequestUrl: (...a: unknown[]) => mockUpdate(...a),
  },
}));

import { toast } from "sonner";
import { ApiError } from "@/lib/api/fetch";
import { ExceptionRequestLinkCard } from "../exception-request-link-card";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExceptionRequestLinkCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = { exceptionRequestUrl: null };
  mockUpdate.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("ExceptionRequestLinkCard", () => {
  it("is hidden on a backend that does not report the setting", () => {
    settings = {};
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the stored template and saves an edit", async () => {
    const user = userEvent.setup();
    settings = { exceptionRequestUrl: "https://t.example/{package}" };
    renderCard();
    const input = screen.getByLabelText("Link template");
    expect(input).toHaveValue("https://t.example/{package}");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, "https://t.example/new");
    await user.click(save);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("https://t.example/new"),
    );
    expect(toast.success).toHaveBeenCalledWith("Exception request link saved");
  });

  it("clears the template with an empty value", async () => {
    const user = userEvent.setup();
    settings = { exceptionRequestUrl: "https://t.example/{package}" };
    renderCard();
    await user.clear(screen.getByLabelText("Link template"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(""));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/cleared; refusals use the built-in page/),
    );
  });

  it("explains a 400 inline with the backend's reason, and clears it on edit", async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(
      new ApiError(
        400,
        JSON.stringify({
          code: "VALIDATION_ERROR",
          message: "exception_request_url must be an absolute http or https URL",
        }),
      ),
    );
    renderCard();
    const input = screen.getByLabelText("Link template");
    await user.type(input, "/exceptions/request");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/The link was not saved/);
    expect(alert).toHaveTextContent(/must be an absolute http or https URL/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(
      "exception-request-url-error",
    );

    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back to its own words for a 400 with no message", async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new ApiError(400, ""));
    renderCard();
    await user.type(screen.getByLabelText("Link template"), "nope");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /has to be an absolute http or https URL/,
    );
  });
});
