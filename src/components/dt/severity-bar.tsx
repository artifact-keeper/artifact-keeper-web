"use client";

interface SeverityBarProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export function SeverityBar({ critical, high, medium, low }: SeverityBarProps) {
  const total = critical + high + medium + low;

  if (total === 0) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-full rounded-full bg-muted" />
        <p className="text-xs text-muted-foreground text-center">
          No vulnerabilities
        </p>
      </div>
    );
  }

  const segments = [
    { label: "Critical", count: critical, color: "bg-red-500" },
    { label: "High", count: high, color: "bg-orange-500" },
    { label: "Medium", count: medium, color: "bg-amber-400" },
    { label: "Low", count: low, color: "bg-blue-500" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {segments.map(
          (seg) =>
            seg.count > 0 && (
              <div
                key={seg.label}
                className={`${seg.color} transition-all duration-300`}
                style={{ width: `${(seg.count / total) * 100}%` }}
              />
            )
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block size-2.5 rounded-full ${seg.color}`}
            />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
