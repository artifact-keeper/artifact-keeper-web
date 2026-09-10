// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Repository } from "@/types";
import { RepoListItem } from "./repo-list-item";

const repo: Repository = {
  id: "1",
  key: "npm-proxy",
  name: "NPM Proxy",
  format: "npm",
  repo_type: "remote",
  storage_used_bytes: 0,
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

afterEach(cleanup);

describe("RepoListItem", () => {
  it("renders the row primary action and the actions trigger as siblings, not nested (#672)", () => {
    render(
      <RepoListItem
        repo={repo}
        isSelected={false}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const rowAction = screen.getByRole("button", { name: /npm-proxy/i });
    // The dropdown trigger must NOT be a descendant of the row's primary
    // action — nested interactives make the row's accessible name
    // concatenate the trigger's label.
    expect(
      within(rowAction).queryByRole("button", { name: /repository actions/i })
    ).not.toBeInTheDocument();

    const actionsTrigger = screen.getByRole("button", {
      name: "Repository actions for NPM Proxy",
    });
    expect(actionsTrigger).toBeInTheDocument();
    // Siblings under a shared, non-interactive row container.
    expect(rowAction.parentElement).toBe(actionsTrigger.parentElement);
  });

  it("gives the row primary action a clean accessible name without the actions label", () => {
    render(<RepoListItem repo={repo} isSelected={false} onSelect={vi.fn()} onEdit={vi.fn()} />);

    const rowAction = screen.getByRole("button", { name: /npm-proxy/i });
    // Anchored: the name must end after the storage size — any concatenated
    // "Repository actions ..." label fails this.
    expect(rowAction).toHaveAccessibleName(/^npm-proxy\s*NPM Proxy\s*npm\s*·\s*remote\s*·\s*0 B$/);
  });

  it("activates onSelect on click and on keyboard Enter/Space", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RepoListItem repo={repo} isSelected={false} onSelect={onSelect} />);

    const rowAction = screen.getByRole("button", { name: /npm-proxy/i });
    await user.click(rowAction);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(repo);

    rowAction.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("does not trigger onSelect when the actions menu is used", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(
      <RepoListItem repo={repo} isSelected={false} onSelect={onSelect} onEdit={onEdit} />
    );

    await user.click(screen.getByRole("button", { name: "Repository actions for NPM Proxy" }));
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(repo);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("omits the actions menu when no edit/delete handlers are provided", () => {
    render(<RepoListItem repo={repo} isSelected={false} onSelect={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /repository actions/i })
    ).not.toBeInTheDocument();
  });
});

describe("RepoListItem - WASM plugin layout label (#592)", () => {
  const pluginRepo: Repository = {
    ...repo,
    id: "2",
    key: "unity-local",
    name: "Unity Local",
    format: "generic",
    format_key: "unity",
    repo_type: "local",
  };

  it("renders the plugin layout label instead of bare GENERIC", () => {
    render(
      <RepoListItem
        repo={pluginRepo}
        isSelected={false}
        onSelect={vi.fn()}
        formatLabel="Unity"
      />
    );

    expect(screen.getByText("Unity")).toBeInTheDocument();
    expect(screen.queryByText("generic")).not.toBeInTheDocument();
  });

  it("still renders GENERIC for a plain generic repo without a layout label", () => {
    const plainGeneric: Repository = {
      ...repo,
      id: "3",
      key: "files",
      name: "Files",
      format: "generic",
      format_key: null,
    };
    render(<RepoListItem repo={plainGeneric} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByText("generic")).toBeInTheDocument();
  });
});

describe("RepoListItem - visibility marker", () => {
  // The whole point of the marker is that `internal` and `private` do NOT
  // render the same: a padlock on both would hide the most consequential
  // difference a list row can show — readable by everyone signed in versus
  // readable by a named few.
  const INTERNAL_LABEL = "Internal — readable by any signed-in user";
  const PRIVATE_LABEL = "Private — readable only by users granted access";

  it("renders no marker for a public repository", () => {
    render(
      <RepoListItem
        repo={{ ...repo, visibility: "public" }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(INTERNAL_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(PRIVATE_LABEL)).not.toBeInTheDocument();
  });

  it("renders the internal marker, distinct from the private one", () => {
    render(
      <RepoListItem
        repo={{ ...repo, is_public: false, visibility: "internal" }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByLabelText(INTERNAL_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(PRIVATE_LABEL)).not.toBeInTheDocument();
  });

  it("renders the private marker, distinct from the internal one", () => {
    render(
      <RepoListItem
        repo={{ ...repo, is_public: false, visibility: "private" }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByLabelText(PRIVATE_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(INTERNAL_LABEL)).not.toBeInTheDocument();
  });

  it("falls back to is_public when the backend predates the visibility field", () => {
    const legacyPrivate: Repository = { ...repo, is_public: false };
    delete (legacyPrivate as { visibility?: unknown }).visibility;
    render(
      <RepoListItem repo={legacyPrivate} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByLabelText(PRIVATE_LABEL)).toBeInTheDocument();

    cleanup();

    // `repo` itself is legacy-shaped: is_public true, no visibility field.
    render(<RepoListItem repo={repo} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByLabelText(PRIVATE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(INTERNAL_LABEL)).not.toBeInTheDocument();
  });
});
