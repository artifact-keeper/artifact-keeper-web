"use client";

interface RiskGaugeProps {
  score: number; // 0-100+
  className?: string;
}

export function RiskGauge({ score, className }: RiskGaugeProps) {
  const clamped = Math.min(score, 100);
  const ratio = clamped / 100;

  // Arc parameters: center at (100, 100), radius 80
  const cx = 100;
  const cy = 100;
  const r = 80;

  // Start angle: 180 degrees (left), End angle: 0 degrees (right)
  // Full arc from (-80, 0) relative to center to (+80, 0) relative to center
  const startX = cx - r;
  const startY = cy;
  const endX = cx + r;
  const endY = cy;

  // Background arc (full semi-circle)
  const bgPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;

  // Foreground arc: angle goes from PI (180deg) to PI * (1 - ratio) (i.e. 0 at full)
  const angle = Math.PI * (1 - ratio);
  const fgEndX = cx + r * Math.cos(angle);
  const fgEndY = cy - r * Math.sin(angle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const fgPath = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${fgEndX} ${fgEndY}`;

  // Color based on score
  let color: string;
  if (score < 33) {
    color = "#22c55e"; // green-500
  } else if (score < 66) {
    color = "#f59e0b"; // amber-500
  } else {
    color = "#ef4444"; // red-500
  }

  return (
    <div className={className}>
      <svg viewBox="0 0 200 120" className="w-full max-w-[200px] mx-auto">
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={12}
          strokeLinecap="round"
          className="text-muted/40"
        />
        {/* Foreground arc */}
        {ratio > 0 && (
          <path
            d={fgPath}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
          />
        )}
        {/* Score text */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          className="fill-foreground text-3xl font-bold"
          style={{ fontSize: 32, fontWeight: 700 }}
        >
          {Math.round(score)}
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 12 }}
        >
          Risk
        </text>
      </svg>
    </div>
  );
}
