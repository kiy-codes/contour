import { useRef, useState } from "react";
import type { ProfilePoint } from "../routing/elevationProfile";
import { useUnits } from "../units/UnitsContext";
import "./ElevationProfileChart.css";

export interface ElevationProfileChartProps {
  profile: ProfilePoint[];
  onHover: (point: ProfilePoint | null) => void;
}

const WIDTH = 600;
const HEIGHT = 130;
const PAD_LEFT = 44;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 20;

export default function ElevationProfileChart({ profile, onHover }: ElevationProfileChartProps) {
  const { formatDistance, formatElevation } = useUnits();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (profile.length < 2) return null;

  const totalDistance = profile[profile.length - 1].distanceMeters;
  const elevations = profile.map((p) => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevRange = Math.max(maxElev - minElev, 1);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (d: number) => PAD_LEFT + (d / totalDistance) * plotWidth;
  const y = (e: number) => PAD_TOP + plotHeight - ((e - minElev) / elevRange) * plotHeight;

  const linePath = profile.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.distanceMeters).toFixed(1)},${y(p.elevation).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(totalDistance).toFixed(1)},${(PAD_TOP + plotHeight).toFixed(1)} L${PAD_LEFT},${(PAD_TOP + plotHeight).toFixed(1)} Z`;

  const maxIndex = elevations.indexOf(maxElev);
  const minIndex = elevations.indexOf(minElev);

  const handleMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    const distAtCursor = ((relX - PAD_LEFT) / plotWidth) * totalDistance;
    let nearest = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < profile.length; i++) {
      const delta = Math.abs(profile[i].distanceMeters - distAtCursor);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
    onHover(profile[nearest]);
  };

  const handleLeave = () => {
    setHoverIndex(null);
    onHover(null);
  };

  const hoverPoint = hoverIndex !== null ? profile[hoverIndex] : null;

  return (
    <div className="elevation-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="elevation-chart__svg"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={handleLeave}
        onTouchMove={(e) => e.touches[0] && handleMove(e.touches[0].clientX)}
        onTouchEnd={handleLeave}
      >
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + plotHeight} className="elevation-chart__axis" />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + plotHeight}
          x2={WIDTH - PAD_RIGHT}
          y2={PAD_TOP + plotHeight}
          className="elevation-chart__axis"
        />
        <text x={4} y={y(maxElev) + 4} className="elevation-chart__label">
          {formatElevation(maxElev)}
        </text>
        <text x={4} y={y(minElev) + 4} className="elevation-chart__label">
          {formatElevation(minElev)}
        </text>
        <text x={PAD_LEFT} y={HEIGHT - 4} className="elevation-chart__label">
          0
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} textAnchor="end" className="elevation-chart__label">
          {formatDistance(totalDistance)}
        </text>

        <path d={areaPath} className="elevation-chart__area" />
        <path d={linePath} className="elevation-chart__line" />

        <circle cx={x(profile[maxIndex].distanceMeters)} cy={y(maxElev)} r={3} className="elevation-chart__peak" />
        <circle cx={x(profile[minIndex].distanceMeters)} cy={y(minElev)} r={3} className="elevation-chart__peak" />

        {hoverPoint && (
          <>
            <line
              x1={x(hoverPoint.distanceMeters)}
              y1={PAD_TOP}
              x2={x(hoverPoint.distanceMeters)}
              y2={PAD_TOP + plotHeight}
              className="elevation-chart__cursor"
            />
            <circle cx={x(hoverPoint.distanceMeters)} cy={y(hoverPoint.elevation)} r={4} className="elevation-chart__cursor-dot" />
          </>
        )}
      </svg>
      {hoverPoint && (
        <div className="elevation-chart__tooltip">
          {formatDistance(hoverPoint.distanceMeters)} · {formatElevation(hoverPoint.elevation)}
        </div>
      )}
    </div>
  );
}
