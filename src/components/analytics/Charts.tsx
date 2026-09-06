"use client";

import React, { useState, useMemo, useRef } from "react";

/**
 * Charts for the dashboard.
 *
 * Colours are the validated categorical slots 1 and 2 (blue, orange). That pair
 * was checked with the palette validator rather than chosen by eye: worst
 * adjacent separation 24.7 under protanopia, 33.6 for normal vision, both
 * clearing 3:1 against a white surface.
 *
 * Two rules hold throughout:
 *  - Text wears ink colours, never a series colour. A coloured mark next to a
 *    label carries the identity; the label itself stays readable.
 *  - Marks are thin and the grid is a recessive hairline. Heavy fills at this
 *    size read as loud rather than informative.
 */

export const SERIES = {
  primary: "#2a78d6",
  secondary: "#eb6834",
} as const;

const GRID = "#e8eaed";
const AXIS_TEXT = "#71717a";

export interface SeriesPoint {
  label: string;
  values: number[];
}

/**
 * Area chart over time.
 *
 * Ships a crosshair and tooltip by default — an SVG chart in a browser is
 * interactive, and a trend line with no way to read a specific day forces the
 * viewer to estimate against the axis.
 */
export function TrendChart({
  points,
  seriesNames,
  height = 200,
  formatValue = (v: number) => v.toLocaleString(),
}: {
  points: SeriesPoint[];
  seriesNames: string[];
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // The x-axis band lives inside this height, so the card never grows a tiny
  // nested scrollbar to reveal its own labels.
  const AXIS_BAND = 22;
  const PAD = { top: 10, right: 10, bottom: AXIS_BAND, left: 34 };
  const W = 720;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const colours = [SERIES.primary, SERIES.secondary];

  const max = useMemo(() => {
    const highest = Math.max(...points.flatMap((p) => p.values), 0);
    // A flat-zero series still needs a scale, or every point lands on the axis
    // and the chart looks broken rather than empty.
    return highest === 0 ? 1 : Math.ceil(highest * 1.15);
  }, [points]);

  if (!points.length) return null;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const linePath = (index: number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.values[index] ?? 0)}`).join(" ");

  const areaPath = (index: number) =>
    `${linePath(index)} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  // Roughly six labels regardless of range length, so a 30-day axis does not
  // collide with itself.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * W;
    const index = Math.round(((svgX - PAD.left) / plotW) * (points.length - 1));
    setHover(index >= 0 && index < points.length ? index : null);
  };

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4">
        {seriesNames.map((name, index) => (
          <span key={name} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ background: colours[index] }} />
            {name}
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {colours.map((colour, index) => (
            <linearGradient key={colour} id={`fill-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity="0.16" />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Solid hairline grid, one shade off the surface. Never dashed. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth="1" />
            <text
              x={PAD.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize="9"
              fill={AXIS_TEXT}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick}
            </text>
          </g>
        ))}

        {points.map((point, i) =>
          i % labelEvery === 0 ? (
            <text key={point.label} x={x(i)} y={height - 6} textAnchor="middle" fontSize="9" fill={AXIS_TEXT}>
              {point.label}
            </text>
          ) : null,
        )}

        {seriesNames.map((_, index) => (
          <g key={index}>
            <path d={areaPath(index)} fill={`url(#fill-${index})`} />
            <path
              d={linePath(index)}
              fill="none"
              stroke={colours[index]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={AXIS_TEXT}
              strokeWidth="1"
              opacity="0.4"
            />
            {seriesNames.map((_, index) => (
              // A 2px surface ring keeps the marker legible where the two
              // series cross.
              <circle
                key={index}
                cx={x(hover)}
                cy={y(points[hover].values[index] ?? 0)}
                r="4.5"
                fill={colours[index]}
                stroke="#ffffff"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > points.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="text-[10px] font-bold text-slate-900">{points[hover].label}</p>
          {seriesNames.map((name, index) => (
            <p key={name} className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: colours[index] }} />
              {name}
              <span className="ml-auto pl-2 font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatValue(points[hover].values[index] ?? 0)}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A compact funnel.
 *
 * One colour for every stage. Bar length already encodes the count, so a
 * gradient across stages would be decoration carrying no extra information —
 * and the ordinal blue ramp fails its own adjacent-lightness check at seven
 * steps anyway.
 */
export function CompactFunnel({
  steps,
}: {
  steps: Array<{ key: string; label: string; count: number; stepRate: number | null }>;
}) {
  const widest = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={step.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-slate-700">{step.label}</span>
            <span className="shrink-0 text-[11px] text-slate-500">
              <span className="font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                {step.count.toLocaleString()}
              </span>
              {index > 0 && step.stepRate !== null && (
                <span className="ml-1.5">{step.stepRate.toFixed(0)}%</span>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(1.5, (step.count / widest) * 100)}%`,
                background: SERIES.primary,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A tiny inline trend for a stat tile. No axis, no labels — shape only. */
export function Sparkline({ values, colour = SERIES.primary }: { values: number[]; colour?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const W = 80;
  const H = 20;
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (values.length - 1)) * W} ${H - (v / max) * H}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-5 w-20" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
