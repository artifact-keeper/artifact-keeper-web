"use client";

interface TrendDataPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  height?: number;
  className?: string;
}

const SERIES: {
  key: keyof Pick<TrendDataPoint, "critical" | "high" | "medium" | "low">;
  color: string;
  label: string;
}[] = [
  { key: "critical", color: "#ef4444", label: "Critical" },
  { key: "high", color: "#f97316", label: "High" },
  { key: "medium", color: "#f59e0b", label: "Medium" },
  { key: "low", color: "#3b82f6", label: "Low" },
];

export function TrendChart({
  data,
  height = 200,
  className,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ""}`}
        style={{ height }}
      >
        No trend data available
      </div>
    );
  }

  const padLeft = 40;
  const padBottom = 30;
  const padTop = 10;
  const padRight = 10;

  const chartWidth = Math.max(data.length * 20, 300);
  const chartHeight = height;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padBottom - padTop;

  // Calculate max across all series
  const allValues = data.flatMap((d) => [
    d.critical,
    d.high,
    d.medium,
    d.low,
  ]);
  const maxVal = Math.max(...allValues, 1);

  function toX(i: number): number {
    if (data.length === 1) return padLeft + plotWidth / 2;
    return padLeft + (i / (data.length - 1)) * plotWidth;
  }

  function toY(v: number): number {
    return padTop + plotHeight - (v / maxVal) * plotHeight;
  }

  function buildPolyline(key: keyof Pick<TrendDataPoint, "critical" | "high" | "medium" | "low">): string {
    return data.map((d, i) => `${toX(i)},${toY(d[key])}`).join(" ");
  }

  // X-axis label interval: show ~5-10 labels at most
  const labelInterval = Math.max(1, Math.ceil(data.length / 8));

  // Y-axis tick values
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ maxHeight: height }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <line
            key={tick}
            x1={padLeft}
            x2={chartWidth - padRight}
            y1={toY(tick)}
            y2={toY(tick)}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick) => (
          <text
            key={`y-${tick}`}
            x={padLeft - 6}
            y={toY(tick) + 4}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {tick}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map(
          (d, i) =>
            i % labelInterval === 0 && (
              <text
                key={`x-${i}`}
                x={toX(i)}
                y={chartHeight - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {d.date}
              </text>
            )
        )}

        {/* Series polylines */}
        {SERIES.map((s) => (
          <polyline
            key={s.key}
            points={buildPolyline(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
