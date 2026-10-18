// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { ConfirmDialog } from "../confirm-dialog";

/**
 * Mirrors how the pages use ConfirmDialog: the dialog stays mounted for the
 * page lifetime, and the caller closes it itself after a successful delete
 * (setOpen(false) in the mutation's onSuccess), which Radix does not report
 * through onOpenChange.
 */
function Harness({ onDeleted }: { onDeleted: (name: string) => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => { setTarget("test-a"); setOpen(true); }}>
        delete test-a
      </button>
      <button onClick={() => { setTarget("test-b"); setOpen(true); }}>
        delete test-b
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Repository"
        description="This cannot be undone."
        typeToConfirm={target ?? undefined}
        confirmText="Delete"
        danger
        onConfirm={() => {
          onDeleted(target!);
          setOpen(false);
        }}
      />
    </>
  );
}

function confirmInput() {
  return screen.getByPlaceholderText(/test-/) as HTMLInputElement;
}

describe("ConfirmDialog typeToConfirm (#973)", () => {
  afterEach(() => cleanup());

  it("enables confirm only when the typed text matches", () => {
    render(<Harness onDeleted={() => {}} />);
    fireEvent.click(screen.getByText("delete test-a"));
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toBeDisabled();
    fireEvent.change(confirmInput(), { target: { value: "test-" } });
    expect(btn).toBeDisabled();
    fireEvent.change(confirmInput(), { target: { value: "test-a" } });
    expect(btn).toBeEnabled();
  });

  it("clears the field after a confirmed delete closed by the caller", () => {
    const onDeleted = vi.fn();
    render(<Harness onDeleted={onDeleted} />);

    fireEvent.click(screen.getByText("delete test-a"));
    fireEvent.change(confirmInput(), { target: { value: "test-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleted).toHaveBeenCalledWith("test-a");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("delete test-b"));
    expect(confirmInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("does not carry a matching name over to a reopen for the same target", () => {
    render(<Harness onDeleted={() => {}} />);

    fireEvent.click(screen.getByText("delete test-a"));
    fireEvent.change(confirmInput(), { target: { value: "test-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    fireEvent.click(screen.getByText("delete test-a"));
    expect(confirmInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("clears the field when the target changes while open", () => {
    const { rerender } = render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="t"
        description="d"
        typeToConfirm="test-a"
        confirmText="Delete"
        onConfirm={() => {}}
      />,
    );
    fireEvent.change(confirmInput(), { target: { value: "test-a" } });
    rerender(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="t"
        description="d"
        typeToConfirm="test-b"
        confirmText="Delete"
        onConfirm={() => {}}
      />,
    );
    expect(confirmInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
