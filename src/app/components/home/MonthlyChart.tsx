"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/ledger";
import { formatAmount, formatCompact } from "@/app/lib/format";
import { niceTicks } from "@/app/lib/ticks";

const HEIGHT = 200;
const PAD = { top: 22, right: 8, bottom: 26, left: 44 };
const MAX_BAR = 24;
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Income per month of one year, as columns. One series, so no legend — the
 * card's title and filter say what is plotted. Columns are `gain` (money
 * in), at most 24px wide with a 4px rounded cap and a square foot on the
 * baseline; every column carries its value on its cap, at as many
 * significant figures as fit in the month's band (three on a desktop, two on
 * a phone), and the tooltip has the exact amount. Each month's whole band is
 * its hit target, so a thumb does not have to land on a thin column; arrow
 * keys walk the months.
 *
 * Measured with a ResizeObserver like BalanceChart, so text stays 11px on a
 * phone instead of scaling down with a viewBox.
 */
export default function MonthlyChart({
  values,
  year,
  currentMonth,
  currency,
  label,
  seriesKey,
}: {
  /** Twelve numbers, January first. */
  values: number[];
  year: string;
  /** 'YYYY-MM' of the phone's month, to brighten its label; null if unknown. */
  currentMonth: string | null;
  currency: string;
  /** Whose income this is ("All clients", a name), for the accessible name. */
  label: string;
  /** Changes when the series does (the filter), so the columns rise again for the new one. */
  seriesKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-white/40"
        style={{ height: HEIGHT }}
      >
        No income in {year} yet.
      </div>
    );
  }

  const { ticks, hi } = niceTicks(0, max, 4);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotH;
  const band = plotW / 12;
  const barW = Math.min(MAX_BAR, Math.max(4, band * 0.6));
  const x = (i: number) => PAD.left + i * band + (band - barW) / 2;
  const y = (v: number) => PAD.top + (1 - v / hi) * plotH;
  const currentIndex =
    currentMonth && currentMonth.slice(0, 4) === year ? Number(currentMonth.slice(5, 7)) - 1 : null;
  const maxIndex = values.indexOf(max);
  const hovered = hover === null ? null : { index: hover, value: values[hover] };
  // A phone's band is ~23px, so the labels shrink a point and drop to two
  // significant figures rather than run into each other.
  const labelSize = band < 28 ? 9 : 10;
  const labelFor = (v: number) => {
    const three = formatCompact(v, 3);
    return three.length * labelSize * 0.6 <= band - 4 ? three : formatCompact(v, 2);
  };

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}: income per month in ${year}, highest ${formatAmount(max, currency)} in ${monthLabel(
            `${year}-${String(maxIndex + 1).padStart(2, "0")}`,
          )}`}
          tabIndex={0}
          className="block outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(11, (h ?? -1) + 1));
            else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? 12) - 1));
            else if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          {/* Gridlines + y ticks: recessive, solid hairlines; the baseline a touch stronger. */}
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

          {/* Columns, rising from the baseline left to right when a series arrives. */}
          {values.map((v, i) =>
            v > 0 ? (
              <path
                key={`${seriesKey}-${i}`}
                d={column(x(i), y(v), barW, baseline - y(v))}
                fill="#00ff88"
                fillOpacity={hover === null || hover === i ? 0.9 : 0.55}
                className="animate-grow-y"
                style={{ transformBox: "fill-box", transformOrigin: "bottom", animationDelay: `${i * 25}ms` }}
              />
            ) : null,
          )}

          {/* Each column's value on its cap, lifting into place as the column grows. */}
          {values.map((v, i) =>
            v > 0 ? (
              <text
                key={`${seriesKey}-${i}`}
                x={x(i) + barW / 2}
                y={y(v) - 6}
                textAnchor="middle"
                fontSize={labelSize}
                fill={hover === null || hover === i ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)"}
                fontFamily="var(--font-jetbrains-mono), monospace"
                className="animate-rise"
                style={{ animationDelay: `${i * 25}ms` }}
              >
                {labelFor(v)}
              </text>
            ) : null,
          )}

          {/* Month initials; the phone's month reads brighter. */}
          {MONTH_INITIALS.map((m, i) => (
            <text
              key={i}
              x={PAD.left + i * band + band / 2}
              y={baseline + 17}
              textAnchor="middle"
              fontSize={11}
              fontWeight={i === currentIndex ? 600 : 400}
              fill={i === currentIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)"}
            >
              {m}
            </text>
          ))}

          {/* Hit targets: the whole band, not the column. */}
          {values.map((_, i) => (
            <rect
              key={i}
              x={PAD.left + i * band}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerMove={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </svg>
      )}

      {hovered && width > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-white/10 bg-charcoal/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={
            x(hovered.index) > width * 0.65
              ? { right: `calc(100% - ${x(hovered.index)}px + 8px)` }
              : { left: x(hovered.index) + barW + 8 }
          }
        >
          {/* Value first, label second — the reader has the month and wants the number. */}
          <div className="font-mono text-sm text-white">{formatAmount(hovered.value, currency)}</div>
          <div className="mt-0.5 text-[11px] text-white/50">
            {monthLabel(`${year}-${String(hovered.index + 1).padStart(2, "0")}`)}
          </div>
        </div>
      )}
    </div>
  );
}

/** A column with a 4px rounded cap and a square foot on the baseline. */
function column(x: number, top: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  const bottom = top + h;
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
}
