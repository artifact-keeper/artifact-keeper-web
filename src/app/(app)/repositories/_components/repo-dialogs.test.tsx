// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoDialogs } from './repo-dialogs';

// jsdom doesn't provide ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Replace Radix Select with a native <select> so we can test without portals
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    // Extract options from SelectItem children
    const items: Array<{ value: string; label: string }> = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        // SelectContent wraps SelectItems
        const content = child as React.ReactElement<{ children: React.ReactNode }>;
        React.Children.forEach(content.props.children, (item) => {
          if (React.isValidElement(item) && (item.props as Record<string, unknown>).value) {
            const props = item.props as { value: string; children: React.ReactNode };
            items.push({ value: props.value, label: String(props.children) });
          }
        });
      }
    });
    return (
      <select
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid="mock-select"
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// Mock ConfirmDialog to render a simple button
vi.mock('@/components/common/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm, title }: { open: boolean; onConfirm: () => void; title: string }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm Delete</button>
      </div>
    ) : null,
}));

const defaultProps = {
  createOpen: true,
  onCreateOpenChange: vi.fn(),
  onCreateSubmit: vi.fn(),
  createPending: false,
  editOpen: false,
  onEditOpenChange: vi.fn(),
  editRepo: null,
  onEditSubmit: vi.fn(),
  editPending: false,
  deleteOpen: false,
  onDeleteOpenChange: vi.fn(),
  deleteRepo: null,
  onDeleteConfirm: vi.fn(),
  deletePending: false,
  availableRepos: [],
};

describe('RepoDialogs - Staging Hint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show staging hint by default (local type)', () => {
    render(<RepoDialogs {...defaultProps} />);
    expect(
      screen.queryByText(/staging repos hold artifacts for review/i)
    ).toBeNull();
  });

  it('shows staging hint when staging type is selected', () => {
    render(<RepoDialogs {...defaultProps} />);

    // The second select is the Type select (first is Format)
    const selects = screen.getAllByTestId('mock-select');
    const typeSelect = selects[1]; // Format=0, Type=1
    fireEvent.change(typeSelect, { target: { value: 'staging' } });

    expect(
      screen.getByText(/staging repos hold artifacts for review/i)
    ).toBeTruthy();
  });

  it('hides staging hint when switching from staging to remote', () => {
    render(<RepoDialogs {...defaultProps} />);

    const selects = screen.getAllByTestId('mock-select');
    const typeSelect = selects[1];

    // Select staging
    fireEvent.change(typeSelect, { target: { value: 'staging' } });
    expect(screen.getByText(/staging repos hold artifacts for review/i)).toBeTruthy();

    // Switch to remote
    fireEvent.change(typeSelect, { target: { value: 'remote' } });
    expect(screen.queryByText(/staging repos hold artifacts for review/i)).toBeNull();
  });

  it('does not show upstream URL field when staging type is selected', () => {
    render(<RepoDialogs {...defaultProps} />);

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'staging' } });

    expect(screen.queryByLabelText(/upstream url/i)).toBeNull();
  });

  it('shows upstream URL field when remote type is selected', () => {
    render(<RepoDialogs {...defaultProps} />);

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'remote' } });

    expect(screen.getByLabelText(/upstream url/i)).toBeTruthy();
  });

  it('submits staging type without upstream_url', async () => {
    const onCreateSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RepoDialogs {...defaultProps} onCreateSubmit={onCreateSubmit} />);

    // Fill required fields
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText('my-repo'), 'my-staging');
    await user.type(within(dialog).getByPlaceholderText('My Repository'), 'My Staging');

    // Select staging type (re-query selects after typing caused re-renders)
    const selects = within(dialog).getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'staging' } });

    // Verify hint appeared (confirms the state update took effect)
    expect(screen.getByText(/staging repos hold artifacts for review/i)).toBeTruthy();

    // Submit
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    expect(onCreateSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'my-staging',
        name: 'My Staging',
        repo_type: 'staging',
        upstream_url: undefined,
      })
    );
  });

  it('staging hint contains expected text about promotion', () => {
    render(<RepoDialogs {...defaultProps} />);

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'staging' } });

    const hints = screen.getAllByText(/staging repos hold artifacts for review/i);
    const hint = hints[0];
    expect(hint.textContent).toContain('promotion');
    expect(hint.textContent).toContain('Configure promotion rules after creation');
  });
});

const mockEditRepo = {
  id: '1',
  key: 'test-repo',
  name: 'Test Repo',
  description: 'A test repo',
  format: 'maven' as const,
  repo_type: 'local' as const,
  is_public: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  artifact_count: 0,
  total_size: 0,
  storage_used_bytes: 0,
};

describe('RepoDialogs - Create Dialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "Creating..." text when createPending is true', () => {
    render(<RepoDialogs {...defaultProps} createPending={true} />);
    expect(screen.getByRole('button', { name: /creating/i })).toBeTruthy();
  });

  it('disables submit button when createPending is true', () => {
    render(<RepoDialogs {...defaultProps} createPending={true} />);
    const btn = screen.getByRole('button', { name: /creating/i });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('shows key-taken error when key matches existing repo', async () => {
    const user = userEvent.setup();
    render(
      <RepoDialogs
        {...defaultProps}
        availableRepos={[mockEditRepo]}
      />
    );
    const dialog = screen.getByRole('dialog');
    const keyInput = within(dialog).getByPlaceholderText('my-repo');
    await user.type(keyInput, 'test-repo');
    expect(within(dialog).getByText(/already taken/i)).toBeTruthy();
  });

  it('disables submit when key is taken', async () => {
    const user = userEvent.setup();
    render(
      <RepoDialogs
        {...defaultProps}
        availableRepos={[mockEditRepo]}
      />
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText('my-repo'), 'test-repo');
    const submit = within(dialog).getByRole('button', { name: /^create$/i });
    expect(submit).toHaveProperty('disabled', true);
  });

  it('calls onCreateOpenChange(false) when cancel is clicked', async () => {
    const onCreateOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<RepoDialogs {...defaultProps} onCreateOpenChange={onCreateOpenChange} />);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(onCreateOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits remote type with upstream_url', async () => {
    const onCreateSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RepoDialogs {...defaultProps} onCreateSubmit={onCreateSubmit} />);

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText('my-repo'), 'my-remote');
    await user.type(within(dialog).getByPlaceholderText('My Repository'), 'My Remote');

    // Select remote type
    const selects = within(dialog).getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'remote' } });

    // Fill upstream URL
    const urlInput = screen.getByPlaceholderText('https://registry.npmjs.org');
    await user.type(urlInput, 'https://repo.example.com');

    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    expect(onCreateSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        repo_type: 'remote',
        upstream_url: 'https://repo.example.com',
      })
    );
  });

  it('shows virtual member selection when virtual type is selected', () => {
    render(
      <RepoDialogs
        {...defaultProps}
        availableRepos={[
          { ...mockEditRepo, key: 'local-1', name: 'Local 1', format: 'generic', repo_type: 'local' },
        ]}
      />
    );

    const dialog = screen.getByRole('dialog');
    // Change format to generic (to match available repos)
    const selects = within(dialog).getAllByTestId('mock-select');
    fireEvent.change(selects[0], { target: { value: 'generic' } });
    fireEvent.change(selects[1], { target: { value: 'virtual' } });

    expect(within(dialog).getByText(/member repositories/i)).toBeTruthy();
    expect(within(dialog).getByText('Local 1')).toBeTruthy();
  });

  it('shows "no repos available" message when virtual type has no eligible members', () => {
    render(<RepoDialogs {...defaultProps} />);

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[1], { target: { value: 'virtual' } });

    expect(screen.getByText(/no.*local or remote repositories available/i)).toBeTruthy();
  });

  it('toggles public switch', async () => {
    const user = userEvent.setup();
    render(<RepoDialogs {...defaultProps} />);

    const publicSwitch = screen.getByRole('switch');
    expect(publicSwitch.getAttribute('aria-checked')).toBe('true');

    await user.click(publicSwitch);
    expect(publicSwitch.getAttribute('aria-checked')).toBe('false');
  });
});

describe('RepoDialogs - Edit Dialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders edit dialog when editOpen is true', () => {
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        editOpen={true}
        editRepo={mockEditRepo}
      />
    );

    expect(screen.getByText(/edit repository/i)).toBeTruthy();
    expect(screen.getByText(/test-repo/)).toBeTruthy();
  });

  it('shows "Saving..." text when editPending is true', () => {
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        editOpen={true}
        editRepo={mockEditRepo}
        editPending={true}
      />
    );

    expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
  });

  it('shows key change warning when key is modified', async () => {
    const user = userEvent.setup();
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        editOpen={true}
        editRepo={mockEditRepo}
      />
    );

    const dialog = screen.getByRole('dialog');
    const keyInput = within(dialog).getByDisplayValue('test-repo');
    await user.clear(keyInput);
    await user.type(keyInput, 'new-key');

    expect(within(dialog).getByText(/changing the key will update all urls/i)).toBeTruthy();
  });

  it('calls onEditSubmit with form data', async () => {
    const onEditSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        editOpen={true}
        editRepo={mockEditRepo}
        onEditSubmit={onEditSubmit}
      />
    );

    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByDisplayValue('Test Repo');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Repo');

    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    expect(onEditSubmit).toHaveBeenCalledWith(
      'test-repo',
      expect.objectContaining({ name: 'Updated Repo' })
    );
  });

  it('includes new key in submit data when key is changed', async () => {
    const onEditSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        editOpen={true}
        editRepo={mockEditRepo}
        onEditSubmit={onEditSubmit}
      />
    );

    const dialog = screen.getByRole('dialog');
    const keyInput = within(dialog).getByDisplayValue('test-repo');
    await user.clear(keyInput);
    await user.type(keyInput, 'renamed-repo');

    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    expect(onEditSubmit).toHaveBeenCalledWith(
      'test-repo',
      expect.objectContaining({ key: 'renamed-repo' })
    );
  });
});

describe('RepoDialogs - Delete Dialog', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders delete confirmation when deleteOpen is true', () => {
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        deleteOpen={true}
        deleteRepo={mockEditRepo}
      />
    );

    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    expect(screen.getByText(/delete repository/i)).toBeTruthy();
  });

  it('calls onDeleteConfirm with repo key', () => {
    const onDeleteConfirm = vi.fn();
    render(
      <RepoDialogs
        {...defaultProps}
        createOpen={false}
        deleteOpen={true}
        deleteRepo={mockEditRepo}
        onDeleteConfirm={onDeleteConfirm}
      />
    );

    const confirmDialog = screen.getByTestId('confirm-dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /confirm delete/i }));
    expect(onDeleteConfirm).toHaveBeenCalledWith('test-repo');
  });
});
