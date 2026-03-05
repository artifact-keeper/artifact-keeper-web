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

describe('RootLayout', () => {
  it('renders the Toaster component', async () => {
    // Dynamic import after mocks are set up
    const { default: RootLayout } = await import('./layout');
    const { container } = render(
      <RootLayout>
        <div>test content</div>
      </RootLayout>
    );

    expect(container.querySelector('[data-testid="toaster"]')).toBeTruthy();
  });

  it('renders children inside Providers', async () => {
    const { default: RootLayout } = await import('./layout');
    const { getByText } = render(
      <RootLayout>
        <div>hello world</div>
      </RootLayout>
    );

    expect(getByText('hello world')).toBeTruthy();
  });
});
