import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-gradient-to-br from-muted/50 to-muted p-4">
      {/* Language switcher stays reachable on unauthenticated screens too */}
      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
