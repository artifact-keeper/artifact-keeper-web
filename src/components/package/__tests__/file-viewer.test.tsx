// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FileViewer, type FileViewerProps } from "../file-viewer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock treeApi.getContent
vi.mock("@/lib/api/tree", () => ({
  treeApi: {
    getContent: vi.fn(),
  },
}));

// Mock shiki highlighter - resolve immediately with a stub
vi.mock("@/lib/shiki", () => ({
  getHighlighter: vi.fn(() =>
    Promise.resolve({
      codeToHtml: (_code: string, _opts: unknown) =>
        '<pre class="shiki"><code>highlighted</code></pre>',
    })
  ),
}));

// Mock react-markdown with a simple pass-through
vi.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));

// Mock lucide-react icons to simple spans so we don't pull in SVG rendering
vi.mock("lucide-react", () => ({
  Download: (props: Record<string, unknown>) => (
    <span data-testid="icon-download" {...props} />
  ),
  X: (props: Record<string, unknown>) => (
    <span data-testid="icon-x" {...props} />
  ),
  FileWarning: (props: Record<string, unknown>) => (
    <span data-testid="icon-file-warning" {...props} />
  ),
  Loader2: (props: Record<string, unknown>) => (
    <span data-testid="icon-loader" {...props} />
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { treeApi } from "@/lib/api/tree";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function renderFileViewer(overrides: Partial<FileViewerProps> = {}) {
  const props: FileViewerProps = {
    repositoryKey: "my-repo",
    filePath: "src/index.js",
    fileName: "index.js",
    fileSize: 1024,
    onClose: vi.fn(),
    ...overrides,
  };

  const queryClient = createQueryClient();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <FileViewer {...props} />
    </QueryClientProvider>
  );

  return { ...result, props };
}

/** Create an ArrayBuffer from a string. */
function textBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** Create an ArrayBuffer with binary (non-text) content. */
function binaryBuffer(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a, 0x0a])
    .buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FileViewer", () => {
  // ---- Header rendering ----

  it("renders the header with file name, size, download link, and close button", () => {
    // For a .js file the component will fetch content; mock it as pending
    (treeApi.getContent as Mock).mockReturnValue(new Promise(() => {}));

    renderFileViewer({ fileName: "index.js", fileSize: 2048 });

    // File name
    expect(screen.getByText("index.js")).toBeInTheDocument();
    // Formatted size (2 KB)
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    // Download link
    const downloadLink = screen.getByTitle("Download");
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/v1/repositories/my-repo/download/src/index.js"
    );
    // Close button
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });

  // ---- Loading state ----

  it("shows loading state while content is fetching", () => {
    (treeApi.getContent as Mock).mockReturnValue(new Promise(() => {}));

    renderFileViewer();

    expect(screen.getByText("Loading file...")).toBeInTheDocument();
  });

  // ---- Code renderer ----

  it("renders syntax-highlighted content for a .js file", async () => {
    const code = 'console.log("hello");';
    (treeApi.getContent as Mock).mockResolvedValue({
      data: textBuffer(code),
      contentType: "text/javascript",
      totalSize: code.length,
    });

    renderFileViewer({ fileName: "app.js", filePath: "src/app.js" });

    // Wait for the highlighted HTML to appear
    await waitFor(() => {
      expect(screen.getByText("highlighted")).toBeInTheDocument();
    });
  });

  // ---- Markdown renderer ----

  it("renders markdown content through ReactMarkdown", async () => {
    const md = "# Hello World";
    (treeApi.getContent as Mock).mockResolvedValue({
      data: textBuffer(md),
      contentType: "text/markdown",
      totalSize: md.length,
    });

    renderFileViewer({
      fileName: "README.md",
      filePath: "README.md",
    });

    await waitFor(() => {
      expect(screen.getByTestId("react-markdown")).toBeInTheDocument();
      expect(screen.getByText("# Hello World")).toBeInTheDocument();
    });
  });

  // ---- Image renderer ----

  it("renders an img tag with the download URL for image files", () => {
    // Image files skip fetch entirely, so getContent should not be called
    renderFileViewer({
      fileName: "logo.png",
      filePath: "assets/logo.png",
    });

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "/api/v1/repositories/my-repo/download/assets/logo.png"
    );
    expect(img).toHaveAttribute("alt", "logo.png");
    expect(treeApi.getContent).not.toHaveBeenCalled();
  });

  // ---- PDF renderer ----

  it("renders an object tag with the download URL for PDF files", () => {
    renderFileViewer({
      fileName: "report.pdf",
      filePath: "docs/report.pdf",
    });

    const pdfObject = document.querySelector('object[type="application/pdf"]');
    expect(pdfObject).not.toBeNull();
    expect(pdfObject).toHaveAttribute(
      "data",
      "/api/v1/repositories/my-repo/download/docs/report.pdf"
    );
    expect(treeApi.getContent).not.toHaveBeenCalled();
  });

  // ---- Binary renderer ----

  it("renders hex dump for unknown binary file types", async () => {
    const buf = binaryBuffer();
    (treeApi.getContent as Mock).mockResolvedValue({
      data: buf,
      contentType: "application/octet-stream",
      totalSize: buf.byteLength,
    });

    renderFileViewer({
      fileName: "data.bin",
      filePath: "data.bin",
    });

    await waitFor(() => {
      // The binary renderer shows "Binary file (X B)"
      expect(screen.getByText(/Binary file/)).toBeInTheDocument();
    });

    // A hex dump should include the offset prefix
    expect(screen.getByText(/00000000/)).toBeInTheDocument();
  });

  // ---- Close button ----

  it("calls onClose when the close button is clicked", async () => {
    (treeApi.getContent as Mock).mockReturnValue(new Promise(() => {}));

    const { props } = renderFileViewer();
    const user = userEvent.setup();

    await user.click(screen.getByTitle("Close"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // ---- Download link ----

  it("has a download link with the correct href", () => {
    (treeApi.getContent as Mock).mockReturnValue(new Promise(() => {}));

    renderFileViewer({
      repositoryKey: "npm-local",
      filePath: "package/lib/index.js",
      fileName: "index.js",
    });

    const downloadLink = screen.getByTitle("Download");
    expect(downloadLink.tagName).toBe("A");
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/v1/repositories/npm-local/download/package/lib/index.js"
    );
  });
});
