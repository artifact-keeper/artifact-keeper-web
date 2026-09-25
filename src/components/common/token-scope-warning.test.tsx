// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "jest-axe";

vi.mock("@/lib/sdk-client", () => ({}));
const mockGetTokenScopeAnalysis = vi.fn();
vi.mock("@/lib/api/service-accounts", () => ({
  serviceAccountsApi: {
    getTokenScopeAnalysis: (...args: unknown[]) => mockGetTokenScopeAnalysis(...args),
  },
}));

import {
  TokenScopeWarning,
  PreviewScopeWarning,
} from "@/components/common/token-scope-warning";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWarning(count: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TokenScopeWarning accountId="acct-1" tokenId="tok-1" count={count} />
    </QueryClientProvider>
  );
}

describe("TokenScopeWarning (artifact-keeper#4215)", () => {
  /**
   * The row shows a number and nothing else — the detail is a request, and a
   * list of tokens must not pay for it.
   */
  it("renders a count without fetching anything", () => {
    renderWarning(2);

    expect(screen.getByText("2 unreachable")).toBeInTheDocument();
    expect(mockGetTokenScopeAnalysis).not.toHaveBeenCalled();
  });

  it("renders nothing when the token reaches everything", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TokenScopeWarning accountId="a" tokenId="t" count={0} />
      </QueryClientProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * On open: the members, grouped by reason, each group with the one thing
   * that fixes it. `no_grant` is listed first because widening the token's
   * scope cannot fix it.
   */
  it("fetches on open and groups members by reason, grant first", async () => {
    mockGetTokenScopeAnalysis.mockResolvedValue({
      unreachable_member_count: 2,
      unreachable: [
        {
          virtual_repo_key: "nuget-virtual",
          members: [
            { repo_key: "nuget-private", reason: "out_of_token_scope" },
            { repo_key: "nuget-internal", reason: "no_grant" },
          ],
        },
      ],
    });
    renderWarning(2);

    await userEvent.click(screen.getByRole("button", { name: /2 unreachable/i }));

    await waitFor(() => expect(mockGetTokenScopeAnalysis).toHaveBeenCalledWith("acct-1", "tok-1"));
    expect(await screen.findByText("nuget-internal")).toBeInTheDocument();
    expect(screen.getByText("nuget-private")).toBeInTheDocument();

    const headings = screen
      .getAllByText(/has no access|Outside this token's repository scope/)
      .map((el) => el.textContent);
    expect(headings[0]).toMatch(/has no access/);
    expect(screen.getByText(/Grant the service account read access/)).toBeInTheDocument();
    expect(screen.getByText(/Include members of matched virtual repositories/)).toBeInTheDocument();
  });

  /**
   * #905 review: a failed analysis rendered "Nothing — the token reaches every
   * member." beside an "N unreachable" badge. An error must say it could not
   * check, never give the all-clear.
   */
  it("says it could not check when the analysis fails", async () => {
    mockGetTokenScopeAnalysis.mockRejectedValue(new Error("503"));
    renderWarning(2);

    await userEvent.click(screen.getByRole("button", { name: /2 unreachable/i }));

    expect(await screen.findByText(/Couldn't check this token/)).toBeInTheDocument();
    expect(screen.queryByText(/reaches every member/)).not.toBeInTheDocument();
    // Nor a heading that asserts a verdict the check never reached.
    expect(screen.queryByText("This token cannot read")).not.toBeInTheDocument();
  });

  it("has an accessible name that says what the badge is", async () => {
    renderWarning(1);

    expect(
      screen.getByRole("button", { name: /1 unreachable repository, show details/i })
    ).toBeInTheDocument();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TokenScopeWarning accountId="a" tokenId="t" count={3} />
      </QueryClientProvider>
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("PreviewScopeWarning", () => {
  it("renders nothing when the scope reaches everything", () => {
    const { container } = render(<PreviewScopeWarning unreachable={[]} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const absent = render(<PreviewScopeWarning unreachable={undefined} />);
    expect(absent.container).toBeEmptyDOMElement();
  });

  /** One line per virtual repository: which, how many, and what to do. */
  it("names the virtual repository, the count and the single remedy", () => {
    render(
      <PreviewScopeWarning
        unreachable={[
          {
            virtual_repo_key: "nuget-virtual",
            members: [
              { repo_key: "a", reason: "out_of_token_scope" },
              { repo_key: "b", reason: "out_of_token_scope" },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText(/nuget-virtual: 2 members unreachable/)).toBeInTheDocument();
    expect(screen.getByText(/Include members of matched virtual repositories/)).toBeInTheDocument();
    // The individual keys are deliberately absent here: the fix is one click
    // away above, and listing them would crowd the form.
    expect(screen.queryByText("a")).not.toBeInTheDocument();
  });

  it("says so plainly when the two reasons are mixed", () => {
    render(
      <PreviewScopeWarning
        unreachable={[
          {
            virtual_repo_key: "mixed",
            members: [
              { repo_key: "a", reason: "out_of_token_scope" },
              { repo_key: "b", reason: "no_grant" },
            ],
          },
        ]}
      />
    );

    expect(
      screen.getByText(/outside the scope and some are not granted/i)
    ).toBeInTheDocument();
  });
});
