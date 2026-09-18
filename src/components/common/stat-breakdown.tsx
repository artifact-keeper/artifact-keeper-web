// Local/remote breakdown shown on hover; the displayed total is local + remote.
export function StatBreakdown({
  local,
  remote,
}: Readonly<{ local: string | number; remote: string | number }>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-6">
        <span className="opacity-70">Local</span>
        <span className="font-medium tabular-nums">{local}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="opacity-70">Remote</span>
        <span className="font-medium tabular-nums">{remote}</span>
      </div>
    </div>
  );
}
