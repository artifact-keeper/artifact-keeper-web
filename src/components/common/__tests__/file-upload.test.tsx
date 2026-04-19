// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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
    Pause: stub("Pause"),
    Play: stub("Play"),
    RotateCcw: stub("RotateCcw"),
  };
});

vi.mock("@/hooks/use-chunked-upload", () => ({
  useChunkedUpload: vi.fn(),
}));

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
import {
  useChunkedUpload,
  type UseChunkedUploadReturn,
} from "@/hooks/use-chunked-upload";

const mockedUseChunkedUpload = vi.mocked(useChunkedUpload);

function makeHookState(
  overrides: Partial<UseChunkedUploadReturn> = {}
): UseChunkedUploadReturn {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    progress: {
      bytesUploaded: 0,
      totalBytes: 0,
      chunksCompleted: 0,
      chunksTotal: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
    },
    status: "idle",
    error: null,
    hasPendingSession: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

function createMockFile(
  name: string,
  size: number,
  type = "application/octet-stream"
): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe("FileUpload", () => {
  beforeEach(() => {
    mockedUseChunkedUpload.mockReturnValue(makeHookState());
  });

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

  // ---- Drag and drop ----

  it("accepts a file via drag and drop", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUpload onUpload={onUpload} />);

    const dropZone = screen.getByRole("button");
    const file = createMockFile("dropped.jar", 256);

    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(screen.getByText("dropped.jar")).toBeInTheDocument();
  });

  it("applies drag-over styling and clears on drag-leave", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const dropZone = screen.getByRole("button");

    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.className).toContain("border-primary");

    fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.className).not.toContain("border-primary");
  });

  // ---- Keyboard navigation ----

  it("opens file picker on Enter key when no file is selected", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const dropZone = screen.getByRole("button");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.keyDown(dropZone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("opens file picker on Space key when no file is selected", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const dropZone = screen.getByRole("button");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.keyDown(dropZone, { key: " " });
    expect(clickSpy).toHaveBeenCalled();
  });

  // ---- Custom path input ----

  it("renders custom path input when showPathInput is true", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} showPathInput />);

    const pathInput = screen.getByPlaceholderText("e.g. libs/mylib-1.0.jar");
    expect(pathInput).toBeInTheDocument();
  });

  it("passes custom path to onUpload callback", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUpload onUpload={onUpload} showPathInput />);

    const pathInput = screen.getByPlaceholderText("e.g. libs/mylib-1.0.jar");
    fireEvent.change(pathInput, { target: { value: "libs/custom-1.0.jar" } });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("lib.jar", 512)] },
    });
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(
        expect.any(File),
        "libs/custom-1.0.jar"
      );
    });
  });

  it("does not pass path when custom path input is empty", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUpload onUpload={onUpload} showPathInput />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("lib.jar", 512)] },
    });
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(expect.any(File), undefined);
    });
  });

  // ---- File display and clear button ----

  it("displays file name and size after selection", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("my-lib.jar", 2048)] },
    });

    expect(screen.getByText("my-lib.jar")).toBeInTheDocument();
    expect(screen.getByText("2048 bytes")).toBeInTheDocument();
  });

  it("clears file when the X button is clicked", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile("removeme.jar", 100)] },
    });

    expect(screen.getByText("removeme.jar")).toBeInTheDocument();

    // The X button is inside the file display area
    const clearButtons = screen.getAllByRole("button");
    // Find the button containing the X icon (icon-xs variant)
    const xButton = clearButtons.find(
      (btn) => btn.querySelector('[data-testid="icon-X"]') !== null
    );
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);

    expect(screen.queryByText("removeme.jar")).not.toBeInTheDocument();
  });

  // ---- Drop zone click ----

  it("opens file picker when drop zone is clicked (no file selected)", () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);

    const dropZone = screen.getByRole("button");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(dropZone);
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("FileUpload chunked mode", () => {
  const LARGE = 150 * 1024 * 1024;
  const SMALL = 1024;

  beforeEach(() => {
    mockedUseChunkedUpload.mockReturnValue(makeHookState());
  });

  afterEach(cleanup);

  function selectFile(size: number, name = "big.tar") {
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createMockFile(name, size)] },
    });
  }

  // ---- isChunkedMode branching ----

  it("shows the (chunked upload) label when repositoryKey is set and file exceeds threshold", () => {
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);
    expect(screen.getByText(/chunked upload/i)).toBeInTheDocument();
  });

  it("does not show the chunked label when the file is below the threshold", () => {
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(SMALL);
    expect(screen.queryByText(/chunked upload/i)).not.toBeInTheDocument();
  });

  it("does not show the chunked label when no repositoryKey is provided", () => {
    render(<FileUpload onUpload={vi.fn()} />);
    selectFile(LARGE);
    expect(screen.queryByText(/chunked upload/i)).not.toBeInTheDocument();
  });

  // ---- handleUpload routing ----

  it("routes large files to chunked.upload instead of onUpload", async () => {
    const chunkedUpload = vi.fn().mockResolvedValue(undefined);
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ upload: chunkedUpload })
    );
    const onUpload = vi.fn();
    render(
      <FileUpload onUpload={onUpload} repositoryKey="repo-1" showPathInput />
    );

    const pathInput = screen.getByPlaceholderText("e.g. libs/mylib-1.0.jar");
    fireEvent.change(pathInput, { target: { value: "big/path.tar" } });
    selectFile(LARGE);

    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => {
      expect(chunkedUpload).toHaveBeenCalledWith(
        expect.any(File),
        "big/path.tar"
      );
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("routes small files to onUpload even when repositoryKey is provided", async () => {
    const chunkedUpload = vi.fn();
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ upload: chunkedUpload })
    );
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUpload onUpload={onUpload} repositoryKey="repo-1" />);

    selectFile(SMALL);
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(chunkedUpload).not.toHaveBeenCalled();
  });

  // ---- Resume prompt ----

  it("shows a resume prompt when a pending session is detected for the file", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ hasPendingSession: vi.fn().mockReturnValue(true) })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(
      screen.getByText(/previous upload session was found/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Resume Upload")).toBeInTheDocument();
  });

  it("does not show the resume prompt for a small file", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ hasPendingSession: vi.fn().mockReturnValue(true) })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(SMALL);

    expect(
      screen.queryByText(/previous upload session was found/i)
    ).not.toBeInTheDocument();
  });

  it("clears the resume prompt when the file is cleared", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ hasPendingSession: vi.fn().mockReturnValue(true) })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(
      screen.getByText(/previous upload session was found/i)
    ).toBeInTheDocument();

    const xButton = screen
      .getAllByRole("button")
      .find((b) => b.querySelector('[data-testid="icon-X"]') !== null);
    fireEvent.click(xButton!);

    expect(
      screen.queryByText(/previous upload session was found/i)
    ).not.toBeInTheDocument();
  });

  // ---- Pause / Resume controls ----

  it("renders a Pause button while uploading and calls pause() on click", () => {
    const pause = vi.fn();
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ status: "uploading", pause })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    const pauseButton = screen.getByText("Pause").closest("button")!;
    fireEvent.click(pauseButton);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("renders a Resume button when paused and calls resume() on click", () => {
    const resume = vi.fn();
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ status: "paused", resume })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    const resumeButton = screen.getByText("Resume").closest("button")!;
    fireEvent.click(resumeButton);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("disables Cancel while the chunked upload is finalizing", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ status: "finalizing" })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    const cancel = screen.getByText("Cancel").closest("button")!;
    expect(cancel).toBeDisabled();
  });

  it("calls chunked.cancel when Cancel is clicked during an active chunked upload", () => {
    const cancel = vi.fn();
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ status: "uploading", cancel })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    fireEvent.click(screen.getByText("Cancel").closest("button")!);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  // ---- Chunked error banner ----

  it("renders an error banner when chunked.status is error with a message", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({
        status: "error",
        error: new Error("Session expired"),
      })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Upload failed: Session expired");
  });

  // ---- ChunkedProgressDisplay status variants ----

  it("shows 'Computing file checksum...' while hashing", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({
        status: "hashing",
        progress: {
          bytesUploaded: 0,
          totalBytes: LARGE,
          chunksCompleted: 0,
          chunksTotal: 0,
          percentage: 0,
          speed: 0,
          eta: 0,
        },
      })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(
      screen.getByText(/computing file checksum/i)
    ).toBeInTheDocument();
  });

  it("shows 'Finalizing upload...' during finalization", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({
        status: "finalizing",
        progress: {
          bytesUploaded: LARGE,
          totalBytes: LARGE,
          chunksCompleted: 10,
          chunksTotal: 10,
          percentage: 100,
          speed: 0,
          eta: 0,
        },
      })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(screen.getByText(/finalizing upload/i)).toBeInTheDocument();
  });

  it("shows 'Upload paused' while paused", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({
        status: "paused",
        progress: {
          bytesUploaded: LARGE / 2,
          totalBytes: LARGE,
          chunksCompleted: 5,
          chunksTotal: 10,
          percentage: 50,
          speed: 0,
          eta: 0,
        },
      })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(screen.getByText(/upload paused/i)).toBeInTheDocument();
  });

  it("renders chunks completed / total when chunksTotal > 0", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({
        status: "uploading",
        progress: {
          bytesUploaded: LARGE / 2,
          totalBytes: LARGE,
          chunksCompleted: 5,
          chunksTotal: 10,
          percentage: 50,
          speed: 1024 * 1024,
          eta: 30,
        },
      })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(screen.getByText(/5 \/ 10 chunks/)).toBeInTheDocument();
  });

  // ---- Upload button label ----

  it("changes the upload button label to 'Resume Upload' when a pending session exists", () => {
    mockedUseChunkedUpload.mockReturnValue(
      makeHookState({ hasPendingSession: vi.fn().mockReturnValue(true) })
    );
    render(<FileUpload onUpload={vi.fn()} repositoryKey="repo-1" />);
    selectFile(LARGE);

    expect(screen.getByText("Resume Upload")).toBeInTheDocument();
    expect(screen.queryByText(/^Upload$/)).not.toBeInTheDocument();
  });
});
