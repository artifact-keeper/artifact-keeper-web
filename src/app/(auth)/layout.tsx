export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-muted/50 to-muted p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
