// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// Capture mutation configs so we can test onSuccess/onError callbacks
const mutationConfigs: Array<{
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
}> = [];

const mockPush = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let useQueryCallIndex = 0;
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => {
    const idx = useQueryCallIndex++;
    if (idx === 0) {
      // repositories list
      return { data: { items: [], pagination: { total_pages: 1 } }, isLoading: false, isFetching: false };
    }
    // artifact search + extra repos queries return undefined data
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useMutation: (config: (typeof mutationConfigs)[0]) => {
    mutationConfigs.push(config);
    return { mutate: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/lib/api/repositories', () => ({
  repositoriesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/lib/api/search', () => ({
  searchApi: { quickSearch: vi.fn() },
}));

vi.mock('@/lib/query-keys', () => ({
  invalidateGroup: vi.fn(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { is_admin: true } }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

// Stub complex UI components to avoid portal/layout issues
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: Object.assign(
    React.forwardRef(function TooltipTrigger({ children, ...props }: { children: React.ReactNode; asChild?: boolean }, ref: React.Ref<HTMLDivElement>) { return <div ref={ref} {...props}>{children}</div>; }),
    { displayName: 'TooltipTrigger' }
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Stub child components - capture props for assertions
let repoListItemCalls: Array<Record<string, unknown>> = [];
vi.mock('./_components/repo-list-item', () => ({
  RepoListItem: (props: Record<string, unknown>) => {
    repoListItemCalls.push(props);
    return <div data-testid="repo-list-item">{String((props.repo as { key: string }).key)}</div>;
  },
}));

vi.mock('./_components/repo-detail-panel', () => ({
  RepoDetailPanel: ({ repoKey }: { repoKey: string }) => <div data-testid="detail-panel">{repoKey}</div>,
}));

vi.mock('./_components/repo-dialogs', () => ({
  RepoDialogs: () => null,
}));

describe('RepositoriesPage - create mutation callbacks', () => {
  beforeEach(() => {
    mutationConfigs.length = 0;
    useQueryCallIndex = 0;
    repoListItemCalls = [];

    vi.clearAllMocks();
  });

  async function getCreateMutationConfig() {
    const mod = await import('./page');
    const Page = mod.default;
    render(<Page />);
    // First useMutation call is createMutation
    return mutationConfigs[0];
  }

  it('shows staging-specific toast with action on staging repo creation', async () => {
    const config = await getCreateMutationConfig();
    config.onSuccess?.({}, { repo_type: 'staging' });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Repository created',
      expect.objectContaining({
        description: expect.stringMatching(/promotion rules/i),
        action: expect.objectContaining({
          label: 'Go to Staging',
        }),
      })
    );
  });

  it('navigates to /staging when toast action is clicked', async () => {
    const config = await getCreateMutationConfig();
    config.onSuccess?.({}, { repo_type: 'staging' });

    const call = mockToastSuccess.mock.calls[0];
    const action = call[1].action;
    action.onClick();

    expect(mockPush).toHaveBeenCalledWith('/staging');
  });

  it('shows simple toast for non-staging repo creation', async () => {
    const config = await getCreateMutationConfig();
    config.onSuccess?.({}, { repo_type: 'local' });

    expect(mockToastSuccess).toHaveBeenCalledWith('Repository created');
  });

  it('shows error toast on creation failure', async () => {
    const config = await getCreateMutationConfig();
    config.onError?.(new Error('Server error'));

    expect(mockToastError).toHaveBeenCalledWith('Server error');
  });

  it('extracts error message from object with error field', async () => {
    const config = await getCreateMutationConfig();
    config.onError?.({ error: 'Key already exists' });

    expect(mockToastError).toHaveBeenCalledWith('Key already exists');
  });

  it('uses fallback message for unknown error shapes', async () => {
    const config = await getCreateMutationConfig();
    config.onError?.(42);

    expect(mockToastError).toHaveBeenCalledWith('Failed to create repository');
  });
});

describe('RepositoriesPage - rendering', () => {
  beforeEach(() => {
    cleanup();
    mutationConfigs.length = 0;
    useQueryCallIndex = 0;
    repoListItemCalls = [];

    vi.clearAllMocks();
  });

  async function renderPage() {
    const mod = await import('./page');
    const Page = mod.default;
    return render(<Page />);
  }

  it('renders page heading and create button', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('h1')?.textContent).toBe('Repositories');
    // Create button has icon + text, find by text content
    const buttons = Array.from(container.querySelectorAll('button'));
    const createBtn = buttons.find((b) => b.textContent?.includes('Create Repository'));
    expect(createBtn).toBeTruthy();
  });

  it('renders search input', async () => {
    const { container } = await renderPage();
    const input = container.querySelector('input[placeholder*="earch"]');
    expect(input).toBeTruthy();
  });

  it('shows empty state when no repositories', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('No repositories found');
  });

  it('shows detail panel placeholder', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Select a repository');
  });
});

describe('RepositoriesPage - update mutation callbacks', () => {
  beforeEach(() => {
    mutationConfigs.length = 0;
    useQueryCallIndex = 0;
    vi.clearAllMocks();
  });

  async function getUpdateMutationConfig() {
    const mod = await import('./page');
    render(<mod.default />);
    // Second useMutation call is updateMutation
    return mutationConfigs[1];
  }

  it('shows success toast on repo update', async () => {
    const config = await getUpdateMutationConfig();
    config.onSuccess?.({ key: 'test' }, { key: 'test', data: {} });

    expect(mockToastSuccess).toHaveBeenCalledWith('Repository updated');
  });

  it('shows error toast on update failure', async () => {
    const config = await getUpdateMutationConfig();
    config.onError?.(new Error('Update failed'));

    expect(mockToastError).toHaveBeenCalledWith('Update failed');
  });
});

describe('RepositoriesPage - delete mutation callbacks', () => {
  beforeEach(() => {
    mutationConfigs.length = 0;
    useQueryCallIndex = 0;
    vi.clearAllMocks();
  });

  async function getDeleteMutationConfig() {
    const mod = await import('./page');
    render(<mod.default />);
    // Third useMutation call is deleteMutation
    return mutationConfigs[2];
  }

  it('shows success toast on repo deletion', async () => {
    const config = await getDeleteMutationConfig();
    config.onSuccess?.({}, 'test-repo');

    expect(mockToastSuccess).toHaveBeenCalledWith('Repository deleted');
  });

  it('shows error toast on delete failure', async () => {
    const config = await getDeleteMutationConfig();
    config.onError?.({ error: 'Cannot delete' });

    expect(mockToastError).toHaveBeenCalledWith('Cannot delete');
  });

  it('falls back to generic message on unknown delete error', async () => {
    const config = await getDeleteMutationConfig();
    config.onError?.(null);

    expect(mockToastError).toHaveBeenCalledWith('Failed to delete repository');
  });
});
