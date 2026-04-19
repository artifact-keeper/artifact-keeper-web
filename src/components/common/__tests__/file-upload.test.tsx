// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Upload: stub("Upload"),
    X: stub("X"),
    FileIcon: stub("FileIcon"),
    AlertCircle: stub("AlertCircle"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: (props: any) => (
    <div data-testid="progress" data-value={props.value} />
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  formatBytes: (bytes: number) => `${bytes} bytes`,
}));

import { FileUpload } from "../file-upload";

function createMockFile(
  name: string,
  size: number,
  type = "application/octet-stream"
): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe("FileUpload", () => {
  afterEach(cleanup);

  // ---- Error display ----

  it("displays an error message when the upload callback rejects with an Error", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("File exceeds the maximum upload size allowed by the server."));

    render(<FileUpload onUpload={onUpload} />);

    // Select a file via the hidden input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createMockFile("large.bin", 1024);
    fireEvent.change(input, { target: { files: [file] } });

    // Click Upload
    const uploadButton = screen.getByText("Upload");
    fireEvent.click(uploadButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(
        "File exceeds the maximum upload size allowed by the server."
      );
    });
  });

  it("displays a generic error when the upload callback rejects with a non-Error", async () => {
    const onUpload = vi.fn().mockRejectedValue("unknown error");

    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("test.jar", 512)] },
    });

    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
    });
  });

  it("clears the error when a new file is selected", async () => {
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Something went wrong"));

    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // First upload: triggers error
    fireEvent.change(input, {
      target: { files: [createMockFile("bad.bin", 256)] },
    });
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Select a new file: should clear the error
    fireEvent.change(input, {
      target: { files: [createMockFile("good.bin", 128)] },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when the user clicks Cancel", async () => {
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"));

    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("file.bin", 100)] },
    });
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show an error when the upload succeeds", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);

    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("ok.jar", 64)] },
    });
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalled();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
