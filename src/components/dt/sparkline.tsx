"use client";

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color,
  width = 80,
  height = 32,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  // Polygon for fill area: line points + bottom-right + bottom-left
  const polygonPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <polygon points={polygonPoints} fill={color} fillOpacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
