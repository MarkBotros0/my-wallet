"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MonthPoint } from "@/lib/capacity";
import { formatCompact, formatMoney } from "@/app/lib/format";
import { niceTicks } from "@/app/lib/ticks";

const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

/**
 * Fund balance month by month, with the safety buffer as a threshold line.
 *
 * One series, so no legend — the card title names it. The line is `accent`;
 * wherever it dips under the buffer the same path is drawn again in `loss`
 * through a clip, because a breach is a real bad outcome, not decoration.
 * Gridlines are solid hairlines; the buffer is the ONE dashed line, since a
 * dash reads as "threshold" — which it is.
 *
 * Hover/touch snaps a crosshair to the nearest month; the year table beside
 * the chart is the table-view twin, so nothing is readable only by hovering.
 */
export default function BalanceChart({
  points,
  buffer,
  currency,
}: {
  points: MonthPoint[];
  buffer: number;
  currency: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const clipId = useId();

  // Render at the container's real pixel width so axis text stays legible on
  // a phone instead of being scaled down with a fixed viewBox. ResizeObserver
  // fires once on observe, which is where the first width comes from.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const months = points.length - 1;
    const balances = points.map((p) => p.balance);
    const dataMin = Math.min(0, buffer, ...balances);
    const dataMax = Math.max(buffer, ...balances);
    const { ticks, lo, hi } = niceTicks(dataMin, dataMax, 5);
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (m: number) => PAD.left + (months === 0 ? 0 : (m / months) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
    const area = `${path} L${x(months).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`;
    const years = months / 12;
    const labelEvery = years > 10 ? 2 : 1;
    return { months, ticks, lo, hi, plotW, plotH, x, y, path, area, years, labelEvery };
  }, [points, buffer, width]);

  const { months, ticks, lo, hi, plotW, plotH, x, y, path, area, years, labelEvery } = geometry;

  const monthFromClientX = (clientX: number): number | null => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg || plotW <= 0) return null;
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left - PAD.left;
    const m = Math.round((px / plotW) * months);
    return Math.max(0, Math.min(months, m));
  };

  const hovered = hover === null ? null : points[hover];
  const bufferY = y(buffer);
  const breached = points.some((p) => p.balance < buffer);

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Fund balance over ${years} years with a safety buffer of ${formatMoney(buffer, currency)}`}
          tabIndex={0}
          className="block outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          onPointerMove={(e) => setHover(monthFromClientX(e.clientX))}
          onPointerDown={(e) => setHover(monthFromClientX(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(months, (h ?? 0) + 1));
            else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? months) - 1));
            else if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4488ff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#4488ff" stopOpacity="0" />
            </linearGradient>
            {/* Everything below the buffer line. */}
            <clipPath id={clipId}>
              <rect x={PAD.left} y={bufferY} width={plotW} height={Math.max(0, PAD.top + plotH - bufferY)} />
            </clipPath>
          </defs>

          {/* Gridlines + y ticks: recessive, solid hairlines. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="rgba(255,255,255,0.4)"
                fontFamily="var(--font-jetbrains-mono), monospace"
              >
                {formatCompact(t)}
              </text>
            </g>
          ))}

          {/* X ticks at year ends. */}
          {Array.from({ length: years }, (_, i) => i + 1).map((yr) => (
            <g key={yr}>
              <line
                x1={x(yr * 12)}
                x2={x(yr * 12)}
                y1={PAD.top + plotH}
                y2={PAD.top + plotH + 4}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
              />
              {(yr % labelEvery === 0 || yr === years) && (
                <text
                  x={x(yr * 12)}
                  y={PAD.top + plotH + 17}
                  textAnchor="middle"
                  fontSize={11}
                  fill="rgba(255,255,255,0.4)"
                >
                  Y{yr}
                </text>
              )}
            </g>
          ))}

          {/* Area wash + the balance line. */}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke="#4488ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {breached && (
            <path
              d={path}
              fill="none"
              stroke="#ff3355"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={`url(#${clipId})`}
            />
          )}

          {/* The buffer: the one dashed line, because it is a threshold. */}
          {buffer >= lo && buffer <= hi && (
            <g>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={bufferY}
                y2={bufferY}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left + plotW}
                y={bufferY - 5}
                textAnchor="end"
                fontSize={10}
                fill="rgba(255,255,255,0.5)"
              >
                Buffer {formatCompact(buffer)}
              </text>
            </g>
          )}

          {/* Crosshair + marker (8px dot with a 2px surface ring). */}
          {hovered && (
            <g pointerEvents="none">
              <line
                x1={x(hovered.month)}
                x2={x(hovered.month)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
              <circle cx={x(hovered.month)} cy={y(hovered.balance)} r={6} fill="#12121a" />
              <circle
                cx={x(hovered.month)}
                cy={y(hovered.balance)}
                r={4}
                fill={hovered.balance < buffer ? "#ff3355" : "#4488ff"}
              />
            </g>
          )}
        </svg>
      )}

      {hovered && width > 0 && (
        <Tooltip
          left={x(hovered.month)}
          flip={x(hovered.month) > width * 0.65}
          point={hovered}
          buffer={buffer}
          currency={currency}
        />
      )}
    </div>
  );
}

function Tooltip({
  left,
  flip,
  point,
  buffer,
  currency,
}: {
  left: number;
  flip: boolean;
  point: MonthPoint;
  buffer: number;
  currency: string;
}) {
  const year = point.month === 0 ? 0 : Math.ceil(point.month / 12);
  const under = point.balance < buffer;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-lg border border-white/10 bg-charcoal/95 px-3 py-2 shadow-lg backdrop-blur-sm"
      style={flip ? { right: `calc(100% - ${left}px + 10px)` } : { left: left + 10 }}
    >
      {/* Value first, label second — the reader has the month and wants the number. */}
      <div className={`font-mono text-sm ${under ? "text-loss" : "text-white"}`}>
        {formatMoney(point.balance, currency)}
      </div>
      <div className="mt-0.5 text-[11px] text-white/50">
        {point.month === 0 ? "After down payment" : `Month ${point.month} · Year ${year}`}
        {under && <span className="text-loss"> · below buffer</span>}
      </div>
    </div>
  );
}
