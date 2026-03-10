// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    ArrowUpDown: stub("ArrowUpDown"),
    ArrowUp: stub("ArrowUp"),
    ArrowDown: stub("ArrowDown"),
    ChevronLeft: stub("ChevronLeft"),
    ChevronRight: stub("ChevronRight"),
  };
});

vi.mock("@/components/ui/table", () => ({
  Table: ({ children, ...props }: any) => <table {...props}>{children}</table>,
  TableBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
  TableHeader: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TableRow: ({ children, className, onClick, onKeyDown, role, tabIndex, ...props }: any) => (
    <tr
      className={className}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      {...props}
    >
      {children}
    </tr>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <select
      data-testid="select"
      value={value}
      onChange={(e: any) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, ...props }: any) => <>{children}</>,
  SelectValue: () => <span data-testid="select-value" />,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import { DataTable, type DataTableColumn } from "../data-table";

interface TestRow {
  id: string;
  name: string;
  count: number;
}

const columns: DataTableColumn<TestRow>[] = [
  { id: "name", header: "Name", accessor: (r) => r.name, sortable: true },
  { id: "count", header: "Count", accessor: (r) => r.count, sortable: true },
];

const testData: TestRow[] = [
  { id: "1", name: "Alpha", count: 10 },
  { id: "2", name: "Beta", count: 5 },
  { id: "3", name: "Gamma", count: 20 },
];

describe("DataTable", () => {
  afterEach(cleanup);

  // ---- Loading state ----

  it("renders loading skeleton with aria attributes", () => {
    render(<DataTable columns={columns} data={[]} loading />);

    const loadingContainer = screen.getByRole("status");
    expect(loadingContainer).toHaveAttribute("aria-busy", "true");
    expect(loadingContainer).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Loading data")).toBeInTheDocument();
  });

  it("renders skeleton rows when loading", () => {
    render(<DataTable columns={columns} data={[]} loading />);

    const skeletons = screen.getAllByTestId("skeleton");
    // 5 rows x 2 columns = 10 skeletons
    expect(skeletons.length).toBe(10);
  });

  // ---- Empty state ----

  it("renders the empty message when data is empty", () => {
    render(<DataTable columns={columns} data={[]} />);

    expect(screen.getByText("No data found.")).toBeInTheDocument();
  });

  it("renders a custom empty message", () => {
    render(
      <DataTable columns={columns} data={[]} emptyMessage="Nothing here" />
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  // ---- Data rendering ----

  it("renders data rows correctly", () => {
    render(<DataTable columns={columns} data={testData} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  // ---- Sorting ----

  it("sorts ascending on first click of a sortable column", () => {
    render(<DataTable columns={columns} data={testData} />);

    fireEvent.click(screen.getByLabelText("Sort by Name"));

    const cells = screen.getAllByRole("cell");
    // Name cells are at indices 0, 2, 4 (2 columns per row)
    expect(cells[0]).toHaveTextContent("Alpha");
    expect(cells[2]).toHaveTextContent("Beta");
    expect(cells[4]).toHaveTextContent("Gamma");
  });

  it("toggles to descending on second click", () => {
    render(<DataTable columns={columns} data={testData} />);

    const sortButton = screen.getByLabelText("Sort by Name");
    fireEvent.click(sortButton);
    fireEvent.click(sortButton);

    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("Gamma");
    expect(cells[2]).toHaveTextContent("Beta");
    expect(cells[4]).toHaveTextContent("Alpha");
  });

  it("sorts numeric columns correctly", () => {
    render(<DataTable columns={columns} data={testData} />);

    fireEvent.click(screen.getByLabelText("Sort by Count"));

    const cells = screen.getAllByRole("cell");
    // Count cells at indices 1, 3, 5
    expect(cells[1]).toHaveTextContent("5");
    expect(cells[3]).toHaveTextContent("10");
    expect(cells[5]).toHaveTextContent("20");
  });

  it("sets aria-sort attribute on sorted column header", () => {
    render(<DataTable columns={columns} data={testData} />);

    // Before sorting, all sortable headers have aria-sort="none"
    const nameHeader = screen.getByText("Name").closest("th");
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    fireEvent.click(screen.getByLabelText("Sort by Name"));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByLabelText("Sort by Name"));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  // ---- Row click / keyboard accessibility ----

  it("makes rows clickable when onRowClick is provided", () => {
    const handleClick = vi.fn();

    const { container } = render(
      <DataTable
        columns={columns}
        data={testData}
        onRowClick={handleClick}
        rowKey={(r) => r.id}
      />
    );

    // Data rows are in tbody; the first tbody tr is the first data row
    const bodyRows = container.querySelectorAll("tbody tr");
    fireEvent.click(bodyRows[0]);

    expect(handleClick).toHaveBeenCalledWith(testData[0]);
  });

  it("triggers onRowClick on Enter keypress", () => {
    const handleClick = vi.fn();

    const { container } = render(
      <DataTable
        columns={columns}
        data={testData}
        onRowClick={handleClick}
        rowKey={(r) => r.id}
      />
    );

    const bodyRows = container.querySelectorAll("tbody tr");
    fireEvent.keyDown(bodyRows[0], { key: "Enter" });

    expect(handleClick).toHaveBeenCalledWith(testData[0]);
  });

  it("triggers onRowClick on Space keypress", () => {
    const handleClick = vi.fn();

    const { container } = render(
      <DataTable
        columns={columns}
        data={testData}
        onRowClick={handleClick}
        rowKey={(r) => r.id}
      />
    );

    const bodyRows = container.querySelectorAll("tbody tr");
    fireEvent.keyDown(bodyRows[0], { key: " " });

    expect(handleClick).toHaveBeenCalledWith(testData[0]);
  });

  it("sets tabIndex=0 and role=button on clickable rows", () => {
    const handleClick = vi.fn();

    const { container } = render(
      <DataTable
        columns={columns}
        data={testData}
        onRowClick={handleClick}
        rowKey={(r) => r.id}
      />
    );

    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows[0]).toHaveAttribute("tabindex", "0");
    expect(bodyRows[0]).toHaveAttribute("role", "button");
  });

  it("does not add role=button or tabIndex when onRowClick is not provided", () => {
    const { container } = render(<DataTable columns={columns} data={testData} />);

    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows[0]).not.toHaveAttribute("role");
    expect(bodyRows[0]).not.toHaveAttribute("tabindex");
  });

  // ---- Pagination controls ----

  it("renders pagination controls when onPageChange is provided", () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        total={100}
        page={2}
        pageSize={20}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });

  it("disables Previous page button on page 1", () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        total={100}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  it("disables Next page button on last page", () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        total={60}
        page={3}
        pageSize={20}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("calls onPageChange when pagination buttons are clicked", () => {
    const handlePageChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={testData}
        total={100}
        page={3}
        pageSize={20}
        onPageChange={handlePageChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(handlePageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(handlePageChange).toHaveBeenCalledWith(4);
  });

  // ---- Column with no accessor or cell renderer ----

  it("renders null for columns without accessor or cell", () => {
    const cols: DataTableColumn<TestRow>[] = [
      { id: "empty", header: "Empty" },
      { id: "name", header: "Name", accessor: (r) => r.name },
    ];

    render(<DataTable columns={cols} data={testData} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  // ---- Sort with null values ----

  it("handles null values in sort by placing them at the end", () => {
    const dataWithNulls = [
      { id: "1", name: "Beta", count: 5 },
      { id: "2", name: null as unknown as string, count: 10 },
      { id: "3", name: "Alpha", count: 20 },
    ];

    render(<DataTable columns={columns} data={dataWithNulls} />);

    fireEvent.click(screen.getByLabelText("Sort by Name"));

    const cells = screen.getAllByRole("cell");
    // Null should be last (ascending): Alpha, Beta, null
    expect(cells[0]).toHaveTextContent("Alpha");
    expect(cells[2]).toHaveTextContent("Beta");
  });

  // ---- Rows per page display ----

  it("displays correct row range in pagination info", () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        total={45}
        page={2}
        pageSize={20}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    );

    expect(screen.getByText("21-40 of 45")).toBeInTheDocument();
  });

  it("shows 0 results when total is 0", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    );

    // Empty state is shown, but the empty table message is rendered
    expect(screen.getByText("No data found.")).toBeInTheDocument();
  });

  // ---- Sort fallback for non-string/non-number values ----

  it("returns 0 when sorting values that are neither string nor number", () => {
    const boolColumns: DataTableColumn<{ id: string; active: boolean }>[] = [
      {
        id: "active",
        header: "Active",
        accessor: (r) => r.active as unknown as string,
        sortable: true,
      },
    ];
    const boolData = [
      { id: "1", active: true },
      { id: "2", active: false },
      { id: "3", active: true },
    ];

    render(<DataTable columns={boolColumns} data={boolData} />);

    fireEvent.click(screen.getByLabelText("Sort by Active"));

    // Should render all 3 rows without error (sort returns 0 for booleans)
    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(3);
  });

  // ---- onPageSizeChange callback ----

  it("calls onPageSizeChange when page size select changes", () => {
    const handlePageSizeChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={testData}
        total={100}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        onPageSizeChange={handlePageSizeChange}
      />
    );

    const selects = screen.getAllByTestId("select");
    // The page size select should be the one with value "20"
    const pageSizeSelect = selects.find((s) => s.getAttribute("value") === "20") ?? selects[0];
    fireEvent.change(pageSizeSelect, { target: { value: "50" } });

    expect(handlePageSizeChange).toHaveBeenCalledWith(50);
  });
});
