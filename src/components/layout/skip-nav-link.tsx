import { cn } from "@/lib/utils";

/**
 * "Skip to main content" link — the first focusable element in the app shell.
 * Visually hidden until it receives keyboard focus, then appears in the
 * top-left corner. Targets the `<main id="main-content">` landmark rendered
 * by the (app) group layout.
 */
export function SkipNavLink({ className }: { className?: string }) {
  return (
    <a
      href="#main-content"
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50",
        "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2",
        "focus:text-sm focus:font-medium focus:text-primary-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      Skip to main content
    </a>
  );
}
