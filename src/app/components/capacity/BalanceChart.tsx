"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { purchaseOf, type CalculatorInputs, type FlowTotals, type MonthPoint, type SimulationResult } from "@/lib/capacity";
import { flowGroups, type FlowGroup } from "@/app/lib/moneyFlow";
import { placeLabels, textWidth, type LabelCandidate, type Obstacle } from "@/app/lib/chartLabels";
import { formatCompact, formatMoney, formatSignedMoney } from "@/app/lib/format";
import { FLOW_TONE } from "./MoneyFlowList";
import { niceTicks } from "@/app/lib/ticks";

const HEIGHT = 300;
const PAD = { top: 28, right: 14, bottom: 28, left: 56 };
const FONT = 11;
const LABEL_H = 14;
const ACCENT = "#4488ff";
const LOSS = "#ff3355";
const SURFACE = "#12121a";

/**
 * Spendable savings month by month, annotated with the moments that decide
 * the answer: the starting capital and what is paid now (with a loan: the
 * loan received and the guarantee locked, each named — never netted), the
 * tightest month, the extra costs, the end against the keep target — and,
 * for a price that fails, the month the money runs out.
 *
 * One series, so no legend — the card title names it. The line is `accent`;
 * wherever it dips under the buffer the same path is drawn again in `loss`
 * through a clip, because a breach is a real bad outcome, not decoration.
 * Gridlines are solid hairlines; the buffer is the ONE dashed line, since a
 * dash reads as "threshold" — which it is. The keep target only applies to
 * the last month, so it is a tick at the end, not a line across.
 *
 * Direct labels are placed by `placeLabels` in priority order and dropped
 * when they would collide, so a phone-width plot shows the few that matter.
 * Money locked as the bank's guarantee is not spendable, so it is a muted
 * area stacked on the line rather than part of it.
 *
 * Hover/touch snaps a crosshair to the nearest month and the tooltip breaks
 * that month down under the same headings as "Where the money goes"
 * (`flowGroups`); the year table is the table-view twin, so nothing is
 * readable only by hovering.
 */
export default function BalanceChart({
  inputs,
  sim,
  currency,
}: {
  inputs: CalculatorInputs;
  sim: SimulationResult;
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

  const points = sim.monthly;
  const capital = inputs.startingCapital;
  const buffer = inputs.safetyBuffer;
  const keepTarget = inputs.minKeptShare * capital;

  const geometry = useMemo(() => {
    const months = points.length - 1;
    const balances = points.map((p) => p.balance);
    const dataMin = Math.min(0, buffer, ...balances);
    const totals = points.map((p) => p.balance + p.held);
    const dataMax = Math.max(buffer, capital, keepTarget, ...balances, ...totals);
    const { ticks, lo, hi } = niceTicks(dataMin, dataMax, 5);
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (m: number) => PAD.left + (months === 0 ? 0 : (m / months) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;
    const pt = (m: number, v: number) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`;
    // The line starts at the capital and drops straight down by the down
    // payment before the plan's first month — the start IS the down payment.
    const path = [`M${pt(0, capital)}`, ...points.map((p) => `L${pt(p.month, p.balance)}`)].join(" ");
    // Money locked with the bank is not spendable: the accent line is the
    // spendable fund, and a muted area stacks the guarantee on top of it.
    const hasHeld = points.some((p) => p.held > 0);
    const heldTop = hasHeld ? points.map((p, i) => `${i === 0 ? "M" : "L"}${pt(p.month, p.balance + p.held)}`).join(" ") : null;
    const heldArea = heldTop
      ? `${heldTop} ${[...points].reverse().map((p) => `L${pt(p.month, p.balance)}`).join(" ")} Z`
      : null;
    const area = `${path} L${pt(months, lo)} L${pt(0, lo)} Z`;
    const years = months / 12;
    const labelEvery = years > 10 ? 2 : 1;
    return { months, ticks, lo, hi, plotW, plotH, x, y, path, heldTop, heldArea, area, years, labelEvery };
  }, [points, buffer, capital, keepTarget, width]);

  const { months, ticks, lo, hi, plotW, plotH, x, y, path, heldTop, heldArea, area, years, labelEvery } = geometry;

  const annotations = useMemo(() => {
    const xEnd = x(months);
    const last = points[months];
    const under = (v: number) => v < buffer;
    // Three significant figures: a label says "617K", the tooltip has the rest.
    const short = (v: number) => formatCompact(v, 3);

    const markers: { id: string; x: number; y: number; fill: string }[] = [];
    const candidates: LabelCandidate[] = [];
    type Spot = { x: number; y: number; anchor: "start" | "middle" | "end"; v: "above" | "below" | "centre" };
    type Note = { text: string; muted: boolean; leaderFrom?: { x: number; y: number }; leaderSpots?: number[] };
    const texts: Record<string, Note> = {};
    // Spots may depend on the label's width (the fallback under the line
    // needs to know how much line it will sit beneath), so they can be a
    // function of it. `leaderSpots` are the fallbacks far enough from the
    // point that a leader line has to say which point the label is about.
    const note = (
      id: string,
      text: string,
      priority: number,
      spots: Spot[] | ((w: number) => Spot[]),
      opts: Omit<Note, "text"> = { muted: false },
    ) => {
      const w = textWidth(text, FONT);
      candidates.push({
        id,
        priority,
        width: w,
        height: LABEL_H,
        positions: (typeof spots === "function" ? spots(w) : spots).map((s) => ({
          x: s.anchor === "start" ? s.x : s.anchor === "end" ? s.x - w : s.x - w / 2,
          y: s.v === "above" ? s.y - LABEL_H : s.v === "below" ? s.y : s.y - LABEL_H / 2,
        })),
      });
      texts[id] = { text, ...opts };
    };

    // The lowest the line gets (largest y) across a span of pixels, so a
    // label can sit in the wash beneath the whole stretch it covers.
    const lineYAt = (px: number) => {
      const m = ((px - PAD.left) / (plotW || 1)) * months;
      if (m <= 0) return y(points[0].balance);
      if (m >= months) return y(points[months].balance);
      const i = Math.floor(m);
      const f = m - i;
      return y(points[i].balance) * (1 - f) + y(points[i + 1].balance) * f;
    };
    const bandBelow = (x0: number, x1: number) => {
      let lowest = Math.max(lineYAt(x0), lineYAt(x1));
      for (const p of points) {
        const px = x(p.month);
        if (px >= x0 && px <= x1) lowest = Math.max(lowest, y(p.balance));
      }
      return lowest;
    };

    // A cliff: the line falls from last month's balance to this month's. The
    // air is below and to the right of its foot — the line climbs away from
    // there — so that is the first place to try; the last resort is the wash
    // under the line, with a leader up to the foot.
    const cliffSpots =
      (m: number) =>
      (w: number): Spot[] => {
        const top = y(points[m - 1].balance);
        const bottom = y(points[m].balance);
        const mid = (top + bottom) / 2;
        // 10px clears a marker (radius 6) plus the placement gap.
        const band = bandBelow(x(m) - w / 2, x(m) + w / 2);
        return [
          { x: x(m) + 10, y: bottom + 6, anchor: "start", v: "below" },
          { x: x(m) + 10, y: mid, anchor: "start", v: "centre" },
          { x: x(m), y: top - 10, anchor: "middle", v: "above" },
          { x: x(m) - 10, y: mid, anchor: "end", v: "centre" },
          // Rows a label-height apart, for when another label already took
          // the band — two labels' bands rarely line up exactly.
          { x: x(m), y: band + 12, anchor: "middle", v: "below" },
          { x: x(m), y: band + 12 + (LABEL_H + 6), anchor: "middle", v: "below" },
          { x: x(m), y: band + 12 + 2 * (LABEL_H + 6), anchor: "middle", v: "below" },
        ];
      };
    const cliffLeader = (m: number) => ({ leaderFrom: { x: x(m), y: y(points[m].balance) }, leaderSpots: [4, 5, 6] });

    // 0. The buffer, at the right edge above its line.
    if (buffer > 0) {
      note(
        "buffer",
        `Buffer ${short(buffer)}`,
        0,
        [
          { x: xEnd, y: y(buffer) - 4, anchor: "end", v: "above" },
          { x: xEnd, y: y(buffer) + 4, anchor: "end", v: "below" },
          { x: PAD.left + 6, y: y(buffer) - 4, anchor: "start", v: "above" },
        ],
        { muted: true },
      );
    }

    // 1. The month the money runs out — or, when it never does, the tightest month.
    if (sim.firstBreach) {
      const m = sim.firstBreach.month;
      const p = points[m];
      markers.push({ id: "breach", x: x(m), y: y(p.balance), fill: LOSS });
      note("breach", m === 0 ? "Runs out at the start" : `Runs out · month ${m}`, 1, [
        { x: x(m), y: y(p.balance) + 10, anchor: "middle", v: "below" },
        { x: x(m), y: y(p.balance) - 10, anchor: "middle", v: "above" },
        { x: x(m) + 10, y: y(p.balance) + 10, anchor: "start", v: "below" },
        { x: x(m) - 10, y: y(p.balance) + 10, anchor: "end", v: "below" },
      ]);
    } else {
      let low = 0;
      for (let m = 1; m <= months; m++) if (points[m].balance < points[low].balance) low = m;
      // Lowest right after the down payment means the fund only grows from
      // there, and lowest at the end means it only falls; the start and end
      // labels already say those.
      if (low > 0 && low < months) {
        const p = points[low];
        markers.push({ id: "lowest", x: x(low), y: y(p.balance), fill: under(p.balance) ? LOSS : ACCENT });
        note("lowest", `Lowest ${short(p.balance)} · month ${low}`, 1, [
          { x: x(low), y: y(p.balance) + 10, anchor: "middle", v: "below" },
          { x: x(low) + 10, y: y(p.balance) + 10, anchor: "start", v: "below" },
          { x: x(low) - 10, y: y(p.balance) + 10, anchor: "end", v: "below" },
          { x: x(low), y: y(p.balance) - 10, anchor: "middle", v: "above" },
        ]);
      }
    }

    // 2. The end, against the keep target. When the plan ends ON the target —
    //    the usual case when the target is what limits the price — one label
    //    says both, since two would sit on top of each other.
    const keepTick = keepTarget > 0 && keepTarget >= lo && keepTarget <= hi;
    const endOnKeep = keepTick && Math.abs(y(last.balance) - y(keepTarget)) < LABEL_H;
    const endBad = sim.endShortfall !== null || under(last.balance);
    markers.push({ id: "end", x: xEnd, y: y(last.balance), fill: endBad ? LOSS : ACCENT });
    note("end", endOnKeep ? `Ends ${short(last.balance)} = keep target` : `Ends ${short(last.balance)}`, 2, [
      { x: xEnd + 4, y: y(last.balance) - 9, anchor: "end", v: "above" },
      { x: xEnd + 4, y: y(last.balance) + 9, anchor: "end", v: "below" },
      { x: xEnd - 10, y: y(last.balance), anchor: "end", v: "centre" },
    ]);

    // 3. The start: the capital and what month 0 does to it, gross — paid
    //    now, and with a loan the loan received and the guarantee locked,
    //    each named. Above the marker, where nothing else competes; the drop
    //    it describes is right beneath it. Shorter fallbacks when it won't fit.
    markers.push({ id: "start", x: x(0), y: y(capital), fill: ACCENT });
    const startSpots: Spot[] = [
      { x: x(0) + 10, y: y(capital) - 8, anchor: "start", v: "above" },
      { x: x(0) + 10, y: y(capital), anchor: "start", v: "centre" },
    ];
    const paid = sim.upFront > 0 ? ` · paid now −${short(sim.upFront)}` : "";
    const loan = sim.loan && sim.loan.amount > 0 ? sim.loan : null;
    const bank = loan
      ? ` + loan ${short(loan.amount)}${loan.pledge > 0 ? `, guarantee locked ${short(loan.pledge)}` : ""}`
      : "";
    const startTiers = [`Start ${short(capital)}${paid}${bank}`, ...(bank ? [`Start ${short(capital)}${paid}`] : []), ...(paid ? [`Start ${short(capital)}`] : [])];
    startTiers.forEach((text, i) => note(i === 0 ? "start" : `start-${i}`, text, 3 + i * 0.2, startSpots));

    // 4. The keep target: a tick at the end, since it only applies there.
    if (keepTick && !endOnKeep) {
      note(
        "keep",
        `Keep ≥ ${short(keepTarget)}`,
        4,
        [
          { x: xEnd + 8, y: y(keepTarget) + 5, anchor: "end", v: "below" },
          { x: xEnd + 8, y: y(keepTarget) - 5, anchor: "end", v: "above" },
        ],
        { muted: true },
      );
    }

    // 5. Each extra cost, at the cliff it makes.
    for (let m = 12; m <= months; m += 12) {
      const names = costNamesAt(inputs, m);
      if (names.length === 0 || points[m].extraCost <= 0) continue;
      markers.unshift({ id: `cost-${m}`, x: x(m), y: y(points[m].balance), fill: "rgba(255,255,255,0.7)" });
      note(`cost-${m}`, `${names.join(" + ")} −${short(points[m].extraCost)}`, 5, cliffSpots(m), {
        muted: false,
        ...cliffLeader(m),
      });
    }

    // 6. The first installment, once — every later cliff is the same thing.
    const first = points.findIndex((p) => p.installment > 0);
    if (first > 0) {
      const p = purchaseOf(inputs);
      const freq = p.kind === "resale" ? p.resaleFrequency : inputs.schedule.frequency;
      const per = freq === "monthly" ? " a month" : freq === "quarterly" ? " a quarter" : "";
      note("installment", `Installment ${short(points[first].installment)}${per}`, 8, cliffSpots(first), {
        muted: false,
        ...cliffLeader(first),
      });
    }

    // 7. The guarantee: name the muted area once at its START — it closes
    //    onto the line when the pledge comes back, so its end has nothing to
    //    label — and mark the month it all comes back.
    if (sim.loan && sim.loan.pledge > 0) {
      const first = points[1] ?? points[0];
      note("held", "Locked as guarantee", 9, [
        { x: x(first.month) + 10, y: y(first.balance + first.held) - 6, anchor: "start", v: "above" },
        { x: x(first.month) + 10, y: y(first.balance + first.held) + 6, anchor: "start", v: "below" },
      ], { muted: true });
      if (inputs.loan?.release === "at-end" && sim.loan.months <= months) {
        const m = sim.loan.months;
        markers.push({ id: "release", x: x(m), y: y(points[m].balance), fill: "rgba(255,255,255,0.7)" });
        note("release", `Guarantee returned +${short(sim.loan.pledge)}`, 6, cliffSpots(m), { muted: false, ...cliffLeader(m) });
      }
    }

    // A label must clear the data too: the line, sampled every few pixels so
    // a cliff is solid, and the markers.
    const obstacles: Obstacle[] = [];
    const dot = (px: number, py: number) => obstacles.push({ x: px - 1, y: py - 1, width: 2, height: 2 });
    let prev = { x: x(0), y: y(capital) };
    dot(prev.x, prev.y);
    for (const p of points) {
      const cur = { x: x(p.month), y: y(p.balance) };
      const steps = Math.max(1, Math.ceil(Math.hypot(cur.x - prev.x, cur.y - prev.y) / 6));
      for (let s = 1; s <= steps; s++) {
        dot(prev.x + ((cur.x - prev.x) * s) / steps, prev.y + ((cur.y - prev.y) * s) / steps);
      }
      prev = cur;
    }
    for (const m of markers) obstacles.push({ x: m.x - 6, y: m.y - 6, width: 12, height: 12 });

    const placed = placeLabels(
      candidates,
      { left: PAD.left, top: 2, right: width - 2, bottom: PAD.top + plotH },
      3,
      obstacles,
    );
    // A shorter start label only when every longer one did not fit.
    const startIds = startTiers.map((_, i) => (i === 0 ? "start" : `start-${i}`));
    const firstStart = startIds.find((id) => placed.some((p) => p.id === id));
    const labels = placed
      .filter((p) => !startIds.includes(p.id) || p.id === firstStart)
      .map((p) => {
        const t = texts[p.id];
        // A label parked away from its point gets a hairline back to it, from
        // the top edge nearest the point.
        const leader =
          t.leaderFrom && t.leaderSpots?.includes(p.position)
            ? {
                x1: t.leaderFrom.x,
                y1: t.leaderFrom.y + 7,
                x2: Math.max(p.x + 4, Math.min(p.x + p.width - 4, t.leaderFrom.x)),
                y2: p.y - 2,
              }
            : null;
        return { ...p, text: t.text, muted: t.muted, leader };
      })
      // A leader that would run through another label's text is worse than
      // no label; the tooltip still explains the point.
      .filter((l, _, all) => {
        if (!l.leader) return true;
        const { x1, y1, y2 } = l.leader;
        return !all.some(
          (o) => o.id !== l.id && x1 >= o.x - 2 && x1 <= o.x + o.width + 2 && y2 > o.y && y1 < o.y + o.height,
        );
      });
    return { markers, labels, keepTick };
  }, [points, months, sim, inputs, buffer, capital, keepTarget, lo, hi, x, y, plotW, plotH, width]);

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
  const breached = sim.firstBreach !== null;
  const money = (n: number) => formatMoney(n, currency);

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Spendable savings over ${years} years. Starts at ${money(capital)}; ${money(sim.upFront)} paid now${
            sim.loan && sim.loan.amount > 0
              ? `, ${money(sim.loan.amount)} received from the bank and ${money(sim.loan.pledge)} locked as its guarantee`
              : ""
          }; lowest ${money(sim.minBalance)}, ends at ${money(sim.finalBalance)}. Safety buffer ${money(buffer)}${
            keepTarget > 0 ? `, keep target ${money(keepTarget)}` : ""
          }.`}
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
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.16" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
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
                fontSize={FONT}
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
                  fontSize={FONT}
                  fill="rgba(255,255,255,0.4)"
                >
                  Y{yr}
                </text>
              )}
            </g>
          ))}

          {/* Area wash + the balance line. */}
          <path d={area} fill={`url(#${gradientId})`} />
          {heldArea && heldTop && (
            <>
              <path d={heldArea} fill="rgba(255,255,255,0.07)" />
              <path d={heldTop} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeLinejoin="round" />
            </>
          )}
          <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {breached && (
            <path
              d={path}
              fill="none"
              stroke={LOSS}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={`url(#${clipId})`}
            />
          )}

          {/* The buffer: the one dashed line, because it is a threshold. */}
          {buffer > 0 && buffer >= lo && buffer <= hi && (
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={bufferY}
              y2={bufferY}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* The keep target: a tick where it applies — the end. */}
          {annotations.keepTick && (
            <line
              x1={x(months) - 8}
              x2={x(months) + 8}
              y1={y(keepTarget)}
              y2={y(keepTarget)}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}

          {/* Markers: 8px dots with a 2px surface ring. */}
          {annotations.markers.map((m) => (
            <g key={m.id} pointerEvents="none">
              <circle cx={m.x} cy={m.y} r={6} fill={SURFACE} />
              <circle cx={m.x} cy={m.y} r={4} fill={m.fill} />
            </g>
          ))}

          {/* Direct labels — text tokens, never the series colour. */}
          {annotations.labels.map((l) => (
            <g key={l.id} pointerEvents="none">
              {l.leader && (
                <line
                  x1={l.leader.x1}
                  y1={l.leader.y1}
                  x2={l.leader.x2}
                  y2={l.leader.y2}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                />
              )}
              <text
                x={l.x}
                y={l.y + 10.5}
                fontSize={FONT}
                fill={l.muted ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.78)"}
              >
                {l.text}
              </text>
            </g>
          ))}

          {/* Crosshair + hovered marker. */}
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
              <circle cx={x(hovered.month)} cy={y(hovered.balance)} r={6} fill={SURFACE} />
              <circle cx={x(hovered.month)} cy={y(hovered.balance)} r={4} fill={hovered.balance < buffer ? LOSS : ACCENT} />
            </g>
          )}
        </svg>
      )}

      {hovered && width > 0 && (
        <Tooltip
          left={x(hovered.month)}
          flip={x(hovered.month) > width * 0.65}
          point={hovered}
          groups={monthGroups(hovered, inputs, sim)}
          buffer={buffer}
          currency={currency}
        />
      )}
    </div>
  );
}

/** Which extra costs land at the end of this month's year, by name. */
function costNamesAt(inputs: CalculatorInputs, month: number): string[] {
  if (month === 0 || month % 12 !== 0) return [];
  const year = month / 12;
  const names: string[] = [];
  if (inputs.maintenance.share > 0 && inputs.maintenance.year === year) names.push("Maintenance");
  if (inputs.finishing.share > 0 && inputs.finishing.year === year) names.push("Finishing");
  return names;
}

/**
 * The month's movements under the same headings and labels as "Where the
 * money goes" — `flowGroups` reads a month's flows as it reads a year's.
 */
function monthGroups(point: MonthPoint, inputs: CalculatorInputs, sim: SimulationResult): FlowGroup[] {
  const flows: FlowTotals = {
    returns: point.returns,
    certificateInterest: point.certificateInterest,
    income: point.income,
    topUp: point.topUp,
    loanReceived: point.loanReceived,
    released: point.released,
    upFront: point.upFront,
    pledged: point.pledged,
    installments: point.installment,
    bankInstallments: point.bankInstallment,
    extraCosts: point.extraCost,
  };
  return flowGroups(flows, {
    vehicle: inputs.savingsVehicle ?? "fund",
    kind: purchaseOf(inputs).kind,
    hasLoan: !!sim.loan && sim.loan.amount > 0,
  });
}

function Tooltip({
  left,
  flip,
  point,
  groups,
  buffer,
  currency,
}: {
  left: number;
  flip: boolean;
  point: MonthPoint;
  groups: FlowGroup[];
  buffer: number;
  currency: string;
}) {
  const year = point.month === 0 ? 0 : Math.ceil(point.month / 12);
  const under = point.balance < buffer;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-[12rem] rounded-lg border border-white/10 bg-charcoal/95 px-3 py-2 shadow-lg backdrop-blur-sm"
      style={flip ? { right: `calc(100% - ${left}px + 10px)` } : { left: left + 10 }}
    >
      {/* Value first, label second — the reader has the month and wants the number. */}
      <div className={`font-mono text-sm ${under ? "text-loss" : "text-white"}`}>
        {formatMoney(point.balance, currency)}
      </div>
      {point.held > 0 && (
        <div className="text-[11px] text-white/40">+ {formatMoney(point.held, currency)} locked as guarantee</div>
      )}
      <div className="mt-0.5 text-[11px] text-white/50">
        {point.month === 0 ? "Right after paying now" : `Month ${point.month} · Year ${year}`}
        {under && <span className="text-loss"> · below buffer</span>}
      </div>
      {groups.length > 0 && (
        <div className="mt-1.5 space-y-1 border-t border-white/5 pt-1.5 text-[11px]">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{g.title}</p>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.key} className="flex justify-between gap-4">
                    <dt className="text-white/55">{r.label}</dt>
                    <dd className={`font-mono tabular-nums ${FLOW_TONE[r.tone]}`}>{formatSignedMoney(r.amount, "")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
