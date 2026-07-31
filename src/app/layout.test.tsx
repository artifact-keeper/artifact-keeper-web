// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': 'test-nonce' }),
}));

describe('RootLayout', () => {
  it('renders the Toaster component', async () => {
    // Dynamic import after mocks are set up
    const { default: RootLayout } = await import('./layout');
    // RootLayout is an async Server Component — await it before rendering.
    const ui = await RootLayout({
      children: <div>test content</div>,
    });
    const { container } = render(ui);

    expect(container.querySelector('[data-testid="toaster"]')).toBeTruthy();
  });

  it('renders children inside Providers', async () => {
    const { default: RootLayout } = await import('./layout');
    const ui = await RootLayout({
      children: <div>hello world</div>,
    });
    const { getByText } = render(ui);

    expect(getByText('hello world')).toBeTruthy();
  });
});
